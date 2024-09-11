const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// تعریف شِما (Schema) کاربر
const UserSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    }
});

// Hash کردن پسورد قبل از ذخیره کاربر
UserSchema.pre('save', async function(next) {
    try {
        // اگر پسورد تغییر نکرده بود، از این مرحله بگذر
        if (!this.isModified('password')) {
            return next();
        }

        // ایجاد hash برای پسورد
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(this.password, salt);
        this.password = hashedPassword;
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('User', UserSchema);