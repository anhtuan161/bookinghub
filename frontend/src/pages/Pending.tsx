import { Navigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { homePath } from '../lib/nav'
import { useSession } from '../lib/session'

export default function Pending() {
  const { user, refresh, logout } = useSession()
  if (!user) return <Navigate to="/login" replace />
  if (user.status === 'active') return <Navigate to={homePath(user)} replace />
  return (
    <AuthShell title="Đang chờ duyệt" subtitle={user.email}>
      <div className="card space-y-4 p-7 text-center">
        <div className="text-4xl">⏳</div>
        <p className="text-sm leading-relaxed text-slate-600">
          {user.status === 'disabled'
            ? 'Tài khoản đã bị khoá. Liên hệ quản trị nếu cần mở lại.'
            : 'Tài khoản đã được tạo. Quản trị sẽ duyệt và cấp quyền các menu bạn cần dùng. Sau khi được duyệt, bấm "Kiểm tra lại".'}
        </p>
        <div className="flex gap-2">
          <button onClick={() => refresh()} className="btn-primary flex-1">
            Kiểm tra lại
          </button>
          <button onClick={() => logout()} className="btn-ghost flex-1">
            Đăng xuất
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
