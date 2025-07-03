import Tesseract from 'tesseract.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { message } = req.body;

  if (!message) {
    return res.status(200).send('No message');
  }

  const chatId = message.chat.id;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let reply = '';

  try {
    if (message.text && message.text.startsWith('/start')) {
      reply = 'Привет! Напиши /help для списка команд.';
    } else if (message.text && message.text.startsWith('/help')) {
      reply = `
Команды:
- /img <текст> — сгенерировать картинку
- /photo2text — отправь фото после этой команды, я распознаю текст
- /solve — отправь фото задачи после этой команды, я помогу решить
      `.trim();
    } else if (message.text && message.text.startsWith('/photo2text')) {
      reply = 'Отправь фото после этой команды, я распознаю текст на нём.';
    } else if (message.text && message.text.startsWith('/img ')) {
      // Генерация картинки
      const prompt = message.text.slice(5).trim();
      if (!prompt) {
        reply = 'Пожалуйста, укажи описание картинки после команды /img';
      } else {
        // Таймаут для запроса к OpenRouter
        const openrouterKey = process.env.OPENROUTER_API_KEY;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд

        try {
          const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openrouterKey}`
            },
            body: JSON.stringify({
              model: "stable-diffusion-xl-1024-v0.9", // или другой поддерживаемый
              prompt: prompt,
              // можно добавить параметры, например: width, height, etc
              quality: "standard"
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const data = await response.json();

          if (data.data && data.data.length > 0 && data.data[0].url) {
            const imageUrl = data.data[0].url;
            // Отправляем фото в Telegram
            await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, photo: imageUrl, caption: `Вот твоя картинка: ${prompt}` }),
            });
            return res.status(200).send('ok');
          } else if (data.error) {
            reply = `Ошибка генерации изображения: ${data.error.message}`;
            console.error('OpenRouter image error:', data.error);
          } else {
            reply = 'Не удалось сгенерировать изображение.';
            console.error('OpenRouter unknown image response:', data);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            reply = 'Превышено время ожидания генерации изображения, попробуйте позже.';
          } else {
            reply = 'Ошибка при генерации изображения.';
            console.error('Ошибка fetch OpenRouter image:', error);
          }
        }
      }
    } else if (message.photo) {
      // Пользователь прислал фото, распознаём текст через Tesseract.js

      const photoArray = message.photo;
      const fileId = photoArray[photoArray.length - 1].file_id;

      const fileLinkRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const fileLinkData = await fileLinkRes.json();

      if (!fileLinkData.ok) {
        reply = 'Не удалось получить файл.';
      } else {
        const filePath = fileLinkData.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

        const imageResponse = await fetch(fileUrl);
        const imageBuffer = await imageResponse.arrayBuffer();

        const { data: { text } } = await Tesseract.recognize(Buffer.from(imageBuffer), 'rus+eng', {
          logger: m => console.log(m),
        });

        reply = text.trim() || 'Текст не распознан, попробуй отправить фото более четко.';
      }
    } else if (message.text) {
      // Чат с ИИ - OpenRouter с таймаутом 7 сек

      const openrouterKey = process.env.OPENROUTER_API_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openrouterKey}`
          },
          body: JSON.stringify({
            model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
            messages: [{ role: 'user', content: message.text }]
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

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
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          reply = 'Превышено время ожидания ответа ИИ, попробуйте позже.';
        } else {
          reply = 'Ошибка при обращении к ИИ.';
          console.error('Ошибка fetch OpenRouter:', error);
        }
      }
    }

    // Отправляем ответ (если ещё не отправлено фото)
    if (reply) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: reply }),
      });
    }

    res.status(200).send('ok');
  } catch (error) {
    console.error('Ошибка webhook:', error);
    res.status(500).send('Internal Server Error');
  }
}
