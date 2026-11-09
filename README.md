# Priority Matrix (v2)

Web app tĩnh (HTML/JS thuần, không cần build), chạy như PWA trên Android. Dữ liệu lưu local và đồng bộ qua **1 Gist private**.

## Tính năng
- **Backlog**: nơi chứa task chưa phân loại. Task mới vào đây trước.
- **4 ô**: **Now** (gấp + quan trọng) · **Next** (quan trọng, chưa gấp) · **Hand off** (gấp, ít quan trọng) · **Maybe** (chưa gấp, ít quan trọng).
- **Thêm nhanh**: nút `+` → gõ tên → Enter. Có thể bấm "+ Add detail" để ghi chi tiết, chọn ô đích và deadline ngay lúc thêm (nút Today / Tomorrow / +1 week).
- **Deadline + timeline**: mỗi task có deadline; trên card hiển thị `ngày bắt đầu → deadline`, thanh tiến độ thời gian và nhãn dễ hiểu (Due today, 3 days left, 2 days overdue…). Màu cam khi sắp tới hạn, đỏ khi quá hạn. Ngày bắt đầu mặc định là ngày tạo, sửa được trong màn Edit.
- **Detail**: mô tả chi tiết tuỳ chọn (tối đa 2000 ký tự), card hiện icon và dòng xem trước.
- **Phân ô**: kéo biểu tượng ⠿ thả vào ô, hoặc chạm vào task để chọn ô trong menu.
- **Hoàn thành**: chạm vòng tròn bên trái (có Undo). Lưu **ngày hoàn thành** và **ô mà task đang nằm lúc hoàn thành** ("Done 09/11 · from Now").
- **2 chế độ xem**: Matrix và Table (lọc, sắp xếp, tìm kiếm, cột Deadline / Done).
- **Offline-first** + đồng bộ Gist (gộp theo `updatedAt`).

## Cập nhật từ bản cũ
Upload đè toàn bộ file lên repo (cùng tên file). Dữ liệu cũ (trên máy và trong Gist) tự chuyển: `Inbox` → `Backlog`, các trường mới để trống. Nếu app vẫn hiện bản cũ, đóng hẳn app rồi mở lại (hoặc xoá dữ liệu trang một lần) để service worker nạp bản mới.

## Deploy lên GitHub Pages
1. Upload toàn bộ file lên nhánh `main` của repo.
2. **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. Mở `https://<user>.github.io/<repo>/`.

## Kết nối Gist
1. GitHub → Settings → Developer settings → **Personal access tokens → Tokens (classic)** → chỉ tick scope **`gist`**.
2. Mở app → ⚙ → dán token → **Create new Gist** (hoặc dán Gist ID có sẵn) → **Save & sync**.
3. Thiết bị khác: dán cùng token + Gist ID.

Token chỉ lưu trong trình duyệt của thiết bị đó, không nằm trong code.

## Cài lên Android
Chrome → menu ⋮ → **Install app** (hoặc ⚙ → Install app). Nhấn giữ icon app để có shortcut **Add task**.
