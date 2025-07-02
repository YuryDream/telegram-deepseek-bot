export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { message } = req.body;

  if (!message || !message.text) {
    return res.status(200).send('No message');
  }

  const chatId = message.chat.id;
  const text = message.text;

  const token = process.env.TELEGRAM_BOT_TOKEN;

  let reply = '';

  if (text === '/start') {
    reply = 'Привет! Я DreamLine.ai. ИИ на основе новых технологий, давай поговорим, напиши мне.';
  } else {
    reply = Ты написал: ${text};
  }

  const url = https://api.telegram.org/bot${token}/sendMessage;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: reply }),
  });

  res.status(200).send('ok');
}
