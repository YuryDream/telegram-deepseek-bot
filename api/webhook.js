export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { message } = req.body;

  if (!message || !message.text) {
    return res.status(200).send('No message');
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  let reply = '';

  try {
    if (text.startsWith('/start')) {
      reply = 'Привет! Я DreamLine. Напиши /help для списка команд.';
    } else if (text.startsWith('/help')) {
      reply = `
Список команд:
- /img <текст> — сгенерировать картинку
- /photo2text — отправь фото после этой команды, я распознаю текст
- /solve — отправь фото задачи после этой команды, я помогу решить
- /start — приветствие
      `.trim();
    } else if (text.startsWith('/img ')) {
      // Генерация картинки
      const prompt = text.slice(5).trim();
      if (!prompt) {
        reply = 'Пожалуйста, напиши описание для картинки после /img';
      } else {
        // Вызов HuggingFace API для генерации картинки
        const hfToken = process.env.HF_API_TOKEN;
        const hfResponse = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ inputs: prompt })
        });

        if (!hfResponse.ok) {
          reply = 'Ошибка при генерации картинки.';
          console.error('HuggingFace error:', await hfResponse.text());
        } else {
          const imageBuffer = await hfResponse.arrayBuffer();
          // Чтобы отправить картинку, нужно использовать Telegram метод sendPhoto,
          // но webhook.js обычно работает с sendMessage.
          // Для упрощения отправим ссылку или предложим реализовать отправку фото отдельно.
          reply = 'Картинка сгенерирована, но для отправки фото нужно доработать бота.';
        }
      }
    } else if (text.startsWith('/photo2text')) {
      reply = 'Отправь фото после этой команды, чтобы распознать текст.';
      // Реализовать обработку фото нужно в другом обработчике, здесь пока просто ответ
    } else if (text.startsWith('/solve')) {
      reply = 'Отправь фото задачи после этой команды, я попробую её решить.';
      // Аналогично — нужна обработка фото
    } else {
      // Обработка обычного текста через OpenRouter Chat Completion
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
          messages: [{ role: 'user', content: text }]
        })
      });

      const data = await response.json();

      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        reply = data.choices[0].message.content;
      } else if (data.error) {
        reply = `Ошибка ИИ: ${data.error.message}`;
        console.error('OpenRouter error:', data.error);
      } else {
        reply = 'Неизвестная ошибка при получении ответа от ИИ.';
        console.error('OpenRouter unknown response:', data);
      }
    }

    // Отправка ответа в Telegram
    const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });

    return res.status(200).send('ok');

  } catch (error) {
    console.error('Ошибка в обработчике webhook:', error);
    return res.status(500).send('Internal Server Error');
  }
}
