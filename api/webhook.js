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
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  let reply = '';

  if (text === '/start') {
    reply = 'Привет! Я DreamLine. ИИ на основе новых технологий, давай поговорим, напиши мне.';
  } else {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo", // или deepseek-chat, gpt-4, etc
          messages: [
            { role: 'user', content: text }
          ]
        })
      });

      const data = await response.json();

      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        reply = data.choices[0].message.content;
      } else if (data.error) {
        reply = `Ошибка ИИ: ${data.error.message}`;
        console.error('Ошибка от OpenRouter:', data.error);
      } else {
        reply = 'Произошла неизвестная ошибка при получении ответа от ИИ.';
        console.error('Неизвестный ответ OpenRouter:', data);
      }

    } catch (error) {
      console.error('Ошибка при обращении к OpenRouter:', error);
      reply = 'Ошибка при обращении к ИИ.';
    }
  }

  const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });
    res.status(200).send('ok');
  } catch (error) {
    console.error('Ошибка отправки сообщения в Telegram:', error);
    res.status(500).send('Error sending message');
  }
}
