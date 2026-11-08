# Eisenhower Matrix (MVP)

Web app tĩnh (HTML/JS thuần, không cần build), chạy như PWA trên Android. Dữ liệu lưu local và đồng bộ qua **1 Gist private**.

## Tính năng
- **Quick add**: nút `+` góc dưới → gõ tên → Enter (sheet giữ mở để thêm liên tục). Task vào **Inbox**, hoặc chọn luôn ô đích; nút `+` nhỏ ở mỗi ô để thêm thẳng vào ô đó.
- **Phân ô**: kéo biểu tượng ⠿ bên phải task thả vào ô (Do / Schedule / Delegate / Eliminate). Hoặc chạm vào tên task để chọn ô trong menu.
- **Hoàn thành**: chạm vòng tròn bên trái task (có Undo).
- **2 chế độ xem**: Matrix và Table (lọc theo trạng thái / ô, sắp xếp, tìm kiếm, đổi ô bằng dropdown).
- **Offline-first** + đồng bộ Gist (gộp theo `updatedAt`, dùng nhiều thiết bị không mất dữ liệu).

## Deploy lên GitHub Pages
1. Tạo repo mới (public hoặc private đều được), upload toàn bộ file trong thư mục này lên nhánh `main`.
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. Sau ~1 phút mở `https://<user>.github.io/<repo>/`.

## Kết nối Gist
1. GitHub → Settings → Developer settings → **Personal access tokens → Tokens (classic)** → Generate new token, chỉ tick scope **`gist`**.
2. Mở app → biểu tượng ⚙ → dán token → bấm **Create new Gist** (hoặc dán Gist ID có sẵn) → **Save & sync**.
3. Trên máy/điện thoại khác: dán cùng token + Gist ID.

Token chỉ lưu trong trình duyệt của thiết bị đó, không nằm trong code.

## Cài lên Android
Mở bằng Chrome → menu ⋮ → **Install app** (hoặc ⚙ → Install app). Nhấn giữ icon app sẽ có shortcut **Add task**.

## Lưu ý
- Xoá task được giữ dạng "tombstone" 30 ngày để đồng bộ đúng giữa các thiết bị.
- Đồng hồ các thiết bị nên đúng giờ (xung đột được giải quyết theo thời gian sửa gần nhất).
