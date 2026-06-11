// Chạy thử đồng bộ 1 lần rồi thoát (dùng để kiểm tra cấu hình Google/Claude).
//   npm run sync:once
import { config } from '../config.js'
import { sheets } from '../store.js'
import { syncOneSheet } from '../services/sync.js'

const run = async () => {
  console.log(`Chế độ: ${config.demoMode ? 'DEMO' : 'LIVE'} | Model: ${config.llmModel}`)
  for (const s of sheets) {
    process.stdout.write(`- ${s.ownerName}… `)
    await syncOneSheet(s)
    console.log(`${s.syncStatus}${s.lastError ? ' — ' + s.lastError : ''}`)
  }
  console.log('Xong.')
}
run()
