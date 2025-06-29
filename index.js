import { Telegraf } from 'telegraf'
import { createClient } from '@supabase/supabase-js'

console.log('🟢 BOT_TOKEN:', process.env.BOT_TOKEN)
console.log('🟢 SUPABASE_URL:', process.env.SUPABASE_URL)
console.log('🟢 SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY)

const bot = new Telegraf(process.env.BOT_TOKEN)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)



// 👉 /start выводит кнопку «Отправить телефон»
bot.start(ctx => {
  ctx.reply(
    'Добро пожаловать! Пожалуйста, нажмите кнопку ниже, чтобы отправить свой номер телефона:',
    {
      reply_markup: {
        keyboard: [[{ text: '📞 Отправить телефон', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  )
})

// 👉 Получаем контакт
bot.on('contact', async ctx => {
  const phone = ctx.message.contact.phone_number
  const chatId = ctx.from.id

  console.log('Получен телефон:', phone)

  // Важно: Telegram всегда отдаёт телефон с "+"
  // Если ты хранишь в Supabase как +7 — всё ок
  // Если нужно привести в единый вид:
  // const normalizedPhone = phone.replace('+7', '7')

  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .single()

  if (error || !user) {
    console.log('Ошибка:', error)
    ctx.reply('❌ Пользователь с таким номером не найден в системе.')
    return
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ telegram_id: chatId })
    .eq('phone', phone)

  if (updateError) {
    console.log('Ошибка обновления:', updateError)
    ctx.reply('❌ Не удалось сохранить Telegram ID.')
    return
  }

  ctx.reply('✅ Отлично! Ты подписан на уведомления о новых RFQ.')
})

// Запускаем бота
bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
