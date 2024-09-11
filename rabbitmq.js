const amqp = require('amqplib');

let channel = null;

const connectRabbitMQ = async () => {
    try {
        const connection = await amqp.connect('amqp://localhost'); // آدرس RabbitMQ
        channel = await connection.createChannel();
        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
};

const sendToQueue = async (queue, message) => {
    try {
        if (!channel) {
            await connectRabbitMQ();
        }
        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
        console.log(`Message sent to ${queue}`);
    } catch (error) {
        console.error('Error sending message to RabbitMQ:', error);
    }
};

module.exports = {
    sendToQueue
};