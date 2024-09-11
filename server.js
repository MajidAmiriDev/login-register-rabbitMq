const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const User = require('./models/User');
const Message = require('./models/Message');
const Group = require('./models/Group');
const bcrypt = require('bcryptjs');
const redis = require('redis');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rabbitmq = require('./rabbitmq');


const app = express();
app.use(bodyParser.json());

// اتصال به MongoDB
mongoose.connect('mongodb://localhost:27017/phone_auth', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

rabbitmq.connectRabbitMQ();

const redisClient = redis.createClient({
    url: 'redis://default:somePassword@localhost:6379' // جایگزین کردن با URL و رمز عبور Redis
});

redisClient.connect().then(() => {
    console.log('Connected to Redis');
}).catch((err) => {
    console.error('Redis connection error:', err);
});

// ارسال کد تایید به کاربر
app.post('/send-code', async (req, res) => {
    const { phone } = req.body;
    const code = crypto.randomInt(100000, 999999).toString(); // تولید کد ۶ رقمی


    try {
        const lastRequest = await redisClient.get(`lastRequest:${phone}`);
        if (lastRequest) {
            return res.status(429).json({ message: 'Please wait 2 minutes before requesting a new code.' });
        }

        await redisClient.setEx(`smsCode:${phone}`, 600, code); // ذخیره کد با انقضای ۱۰ دقیقه
        await redisClient.setEx(`lastRequest:${phone}`, 120, 'sent'); // ذخیره وضعیت ارسال کد برای ۲ دقیقه

        await axios.post('https://api.kavenegar.com/v1/YOUR_API_KEY/sms/send.json', {
            receptor: phone,
            message: `Your verification code is: ${code}`
        });

        res.status(200).json({ message: 'Verification code sent' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/verify-code', async (req, res) => {
    const { phone, code } = req.body;

    try {
        const storedCode = await redisClient.get(`smsCode:${phone}`);
        if (!storedCode) {
            return res.status(400).json({ message: 'Code expired or not found' });
        }

        if (parseInt(storedCode) == parseInt(code)) {
            console.log(storedCode)
            console.log(code)
            let user = await User.findOne({ phone });
            if (!user) {
                user = new User({
                    phone
                });
                await user.save();
            }

            const token = jwt.sign({ id: user._id, phone: user.phone }, 'your_secret', { expiresIn: '1h' });

            return res.status(200).json({ message: 'Code verified successfully', token });
        } else {
            return res.status(400).json({ message: 'Invalid code' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});



app.post('/register', async (req, res) => {
    const { phone, password } = req.body;

    try {
        let user = await User.findOne({ phone });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        user = new User({
            phone,
            password
        });

        await user.save();
        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

const authenticateJWT = (req, res, next) => {
    const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
    if (token) {
        jwt.verify(token, 'your_secret', (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};


app.post('/create-group', authenticateJWT, async (req, res) => {
    const { name, members } = req.body;

    try {
        const group = new Group({
            name,
            members: [req.user.id, ...members] // اضافه کردن کاربر لاگین شده به لیست اعضا
        });
        await group.save();
        await rabbitmq.sendToQueue('group_events', { type: 'create-group', group });
        res.status(201).json({ message: 'Group created successfully', group });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/send-message', authenticateJWT, async (req, res) => {
    const { groupId, content } = req.body;

    try {
        const message = new Message({
            sender: req.user.id,
            group: groupId,
            content
        });
        await message.save();
        await rabbitmq.sendToQueue('message_events', { type: 'send-message', message });
        res.status(201).json({ message: 'Message sent successfully', message });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/messages/:groupId', authenticateJWT, async (req, res) => {
    const { groupId } = req.params;

    try {
        const messages = await Message.find({ group: groupId }).populate('sender');
        res.status(200).json({ messages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});



// راه‌اندازی سرور
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});