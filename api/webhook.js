import Tesseract from 'tesseract.js';

const userStates = {}; // простой in-memory, для демо

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { message } = req.body;

  if (!message) {
    return res.status(200).send('No message');
  }

  const chatId = message.chat.id;
  const userId = message.from.id;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let reply = '';

  try {
    if (message.text && message.text.startsWith('/start')) {
      userStates[userId] = null; // сброс состояния
      reply = 'Привет! Напиши /help для списка команд.';
    } else if (message.text && message.text.startsWith('/help')) {
      userStates[userId] = null;
      reply = `
Команды:
- /img <текст> — сгенерировать картинку
- /photo2text — отправь фото после этой команды, я распознаю текст
- /solve — отправь фото задачи после этой команды, я помогу решить
      `.trim();
    } else if (message.text && message.text.startsWith('/photo2text')) {
      userStates[userId] = 'photo2text';
      reply = 'Отправь фото после этой команды, я распознаю текст на нём.';
    } else if (message.text && message.text.startsWith('/solve')) {
      userStates[userId] = 'solve';
      reply = 'Отправь фото задачи после этой команды, я постараюсь помочь её решить.';
    } else if (message.text && message.text.startsWith('/img ')) {
      userStates[userId] = null;
      const prompt = message.text.slice(5).trim();
      if (!prompt) {
        reply = 'Пожалуйста, укажи описание картинки после команды /img';
      } else {
        const openrouterKey = process.env.OPENROUTER_API_KEY;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openrouterKey}`
            },
            body: JSON.stringify({
              model: "stable-diffusion-xl-1024-v0.9",
              prompt: prompt,
              quality: "standard"
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const data = await response.json();

          if (data.data && data.data.length > 0 && data.data[0].url) {
            const imageUrl = data.data[0].url;
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
      // Обработка фото — зависит от состояния пользователя
      const state = userStates[userId];

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

        // Загружаем файл в память
        const imageResponse = await fetch(fileUrl);
        const imageBuffer = await imageResponse.arrayBuffer();

        if (state === 'photo2text' || state === 'solve') {
          // Распознаём текст через Tesseract
          const { data: { text } } = await Tesseract.recognize(Buffer.from(imageBuffer), 'rus+eng', {
            logger: m => console.log('Tesseract:', m),
          });

          if (!text.trim()) {
            reply = 'Текст не распознан, попробуй отправить фото более четко.';
          } else {
            if (state === 'solve') {
              // Вызываем OpenRouter для решения задачи
              const openrouterKey = process.env.OPENROUTER_API_KEY;
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 15000);

              try {
                const solveResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openrouterKey}`
                  },
                  body: JSON.stringify({
                    model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
                    messages: [
                      { role: "system", content: "Ты - помощник, который решает математические и логические задачи." },
                      { role: "user", content: `Реши эту задачу:\n\n${text.trim()}` }
                    ]
                  }),
                  signal: controller.signal
                });

                clearTimeout(timeoutId);

                const solveData = await solveResponse.json();

                if (solveData.choices && solveData.choices.length > 0 && solveData.choices[0].message) {
                  reply = `Распознанный текст задачи:\n\n${text.trim()}\n\nРешение:\n${solveData.choices[0].message.content}`;
                } else if (solveData.error) {
                  reply = `Ошибка при решении задачи: ${solveData.error.message}`;
                  console.error('OpenRouter solve error:', solveData.error);
                } else {
                  reply = 'Не удалось получить решение задачи от ИИ.';
                  console.error('OpenRouter unknown solve response:', solveData);
                }
              } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                  reply = 'Превышено время ожидания ответа ИИ, попробуйте позже.';
                } else {
                  reply = 'Ошибка при обращении к ИИ для решения задачи.';
                  console.error('Ошибка fetch OpenRouter solve:', error);
                }
              }
            } else {
              reply = text.trim();
            }
          }

          userStates[userId] = null; // сброс состояния после обработки
        } else {
          reply = 'Я не понимаю, зачем ты отправил это фото. Напиши /help для списка команд.';
        }
      }
    } else if (message.text) {
      userStates[userId] = null;
      // Чат с ИИ по любому другому тексту

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
            model: "gpt-3.5-turbo",
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
