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
    } else if (message.photo) {
      // Пользователь прислал фото — проверим, была ли перед этим команда /photo2text
      // Для простоты — будем считать, что любое фото мы распознаём

      // Получаем file_id самого большого фото (последний в массиве)
      const photoArray = message.photo;
      const fileId = photoArray[photoArray.length - 1].file_id;

      // Получаем ссылку на файл
      const fileLinkRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const fileLinkData = await fileLinkRes.json();

      if (!fileLinkData.ok) {
        reply = 'Не удалось получить файл.';
      } else {
        const filePath = fileLinkData.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

        // Скачиваем картинку
        const imageResponse = await fetch(fileUrl);
        const imageBuffer = await imageResponse.arrayBuffer();

        // Распознаём текст с помощью Tesseract.js
        const { data: { text } } = await Tesseract.recognize(Buffer.from(imageBuffer), 'rus+eng', {
          logger: m => console.log(m), // можно убрать логи позже
        });

        reply = text.trim() || 'Текст не распознан, попробуй отправить фото более четко.';
      }
    } else if (message.text) {
      // Другие команды и чат с ИИ...

      // Таймаут для запроса к OpenRouter
      const openrouterKey = process.env.OPENROUTER_API_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000); // 7 секунд

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

    // Отправляем ответ в Telegram
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });

    res.status(200)


end('ok');
  } catch (error) {
    console.error('Ошибка webhook:', error);
    res.status(500).send('Internal Server Error');
  }
}.s
