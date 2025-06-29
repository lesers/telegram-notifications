import dotenv from 'dotenv'
dotenv.config()

import { Telegraf } from 'telegraf'
import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'

const bot = new Telegraf(process.env.BOT_TOKEN)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

// ✅ 1️⃣ Регистрация по команде
bot.start(ctx => {
  ctx.reply('Добро пожаловать! Нажмите кнопку, чтобы отправить номер:', {
    reply_markup: {
      keyboard: [[{ text: '📞 Отправить телефон', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  })
})

bot.on('contact', async ctx => {
  let phone = ctx.message.contact.phone_number
  const chatId = ctx.from.id

  phone = phone.replace(/[^+\d]/g, '')

  console.log('📞 Нормализованный телефон:', phone)

  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .single()

  if (error || !user) {
    console.log('❌ Ошибка поиска:', error)
    ctx.reply('❌ Пользователь не найден.')
    return
  }

  await supabase
    .from('users')
    .update({ telegram_id: chatId })
    .eq('phone', phone)

  ctx.reply('✅ Ты подписан на уведомления!')
})

// ✅ 2️⃣ Подписка на новые RFQ и рассылка
supabase
  .channel('rfq_notify')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'rfq_requests' },
    async payload => {
      const rfq = payload.new

      console.log('📢 Новая заявка:', rfq)

      const { data: dealers, error } = await supabase
        .from('users')
        .select('telegram_id, bank_name')
        .eq('role', 'dealer')
        .not('telegram_id', 'is', null)   // 🔑 Для int8 гарантированно

      if (error) {
        console.error('❌ Ошибка загрузки дилеров:', error)
        return
      }

      console.log('Dealers raw:', dealers)

      const visibleDealers = (dealers || []).filter(dealer =>
        rfq.all_dealers ||
        (rfq.selected_banks && rfq.selected_banks.includes(dealer.bank_name))
      )

      console.log(`✅ Дилеров, кому отправим: ${visibleDealers.length}`)

      if (visibleDealers.length === 0) {
        console.log('⚠️ Нет подходящих дилеров.')
        return
      }

      const message = `📢 Новая RFQ:
ISIN: ${rfq.isin}
Объем: ${rfq.volume_mln}M
Mode: ${rfq.mode}
Side: ${rfq.side || '2way'}`

      for (const dealer of visibleDealers) {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: dealer.telegram_id,
            text: message
          })
        })
        console.log(`✅ Отправлено дилеру ${dealer.bank_name}`)
      }
    }
  )
  .subscribe()

bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
