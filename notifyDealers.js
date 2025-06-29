import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Подписка на вставку RFQ
supabase
  .channel('rfq_notify_channel')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'rfq_requests' },
    async payload => {
      console.log('📢 Новая заявка:', payload.new)

      const rfq = payload.new

      await notifyDealers({
        isin: rfq.isin,
        volume: rfq.volume_mln,
        mode: rfq.mode,
        side: rfq.side,
        all_dealers: rfq.all_dealers,
        selected_banks: rfq.selected_banks || []
      })
    }
  )
  .subscribe()

export async function notifyDealers(rfqRequest) {
  console.log('✅ Запускаем фильтрацию для рассылки')

  // 1️⃣ Получаем всех дилеров с Telegram ID
  const { data: dealers, error } = await supabase
    .from('users')
    .select('telegram_id, bank_name, role')
    .eq('role', 'dealer')
    .neq('telegram_id', null)

  if (error) {
    console.error('❌ Ошибка загрузки дилеров:', error)
    return
  }

  console.log(`Найдено дилеров всего: ${dealers.length}`)

  // 2️⃣ Фильтрация по логике RFQ
  const visibleDealers = dealers.filter(dealer =>
    rfqRequest.all_dealers ||
    (rfqRequest.selected_banks && rfqRequest.selected_banks.includes(dealer.bank_name))
  )

  console.log(`✅ Дилеров, кому подходит: ${visibleDealers.length}`)

  if (visibleDealers.length === 0) {
    console.log('⚠️ Нет подходящих дилеров для этой заявки.')
    return
  }

  // 3️⃣ Формируем сообщение
  const message = `📢 Новая RFQ:
ISIN: ${rfqRequest.isin}
Объем: ${rfqRequest.volume}M
Mode: ${rfqRequest.mode.toUpperCase()}
Side: ${rfqRequest.side || 'TwoWay'}
${rfqRequest.all_dealers ? 'Видно всем дилерам' : 'Банки: ' + rfqRequest.selected_banks.join(', ')}
`

  // 4️⃣ Шлём Telegram каждому подходящему
  for (const dealer of visibleDealers) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: dealer.telegram_id,
            text: message
          })
        }
      )

      const result = await res.json()
      console.log(`✅ Уведомление дилеру ${dealer.bank_name} => ${result.ok}`)
    } catch (err) {
      console.error(`❌ Ошибка при отправке дилеру ${dealer.bank_name}:`, err)
    }
  }
}
