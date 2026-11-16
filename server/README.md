# Máy chủ HeartOS AI

Máy chủ nhỏ giữ khóa API của Claude (Anthropic) và ChatGPT (OpenAI). Ứng dụng HeartOS trên điện thoại khách chỉ nói chuyện với máy chủ này, nên:

- Khóa API không bao giờ nằm trong ứng dụng, không ai giải nén APK để lấy được.
- Khách không thấy tên nhà cung cấp AI, kể cả khi soi đường truyền: chỉ thấy tên miền của bạn.
- Đổi khóa, đổi mô hình hay chuyển Claude và ChatGPT làm chính chỉ cần sửa máy chủ, không phải cập nhật ứng dụng.
- Mỗi điện thoại có giới hạn số câu hỏi mỗi ngày để không bị lạm dụng.

## Chạy nhanh trên máy chủ Linux

Cần Node.js 20 trở lên.

```bash
cp .env.example .env
```

Mở tệp `.env`, điền `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (có thể chỉ một trong hai), và đặt `GATEWAY_SECRET` là một chuỗi ngẫu nhiên dài:

```bash
openssl rand -base64 32
```

Chạy:

```bash
set -a; . ./.env; set +a; node heartos-ai-gateway.mjs
```

Khi khởi động máy chủ tự kiểm tra hai khóa và in ra "Khóa Anthropic: dùng được", "Khóa OpenAI: dùng được".

## Chạy bằng Docker

```bash
docker build -t heartos-ai .
```

```bash
docker run -d --name heartos-ai --restart unless-stopped --env-file .env -v heartos-ai-data:/data -p 8787:8787 heartos-ai
```

## Bắt buộc dùng HTTPS

Đặt máy chủ sau một tên miền có HTTPS, ví dụ `https://ai.ten-mien-cua-ban.vn`, bằng Caddy, Nginx hoặc dịch vụ đám mây có sẵn HTTPS. Ví dụ Caddy:

```
ai.ten-mien-cua-ban.vn {
  reverse_proxy 127.0.0.1:8787
}
```

## Gắn máy chủ vào ứng dụng

Cách 1, cho bản bán ra: build ứng dụng với biến môi trường, khách cài là dùng được ngay, không phải nhập gì.

```bash
VITE_AI_GATEWAY=https://ai.ten-mien-cua-ban.vn npm run android:apk
```

Cách 2, cho máy trưng bày hoặc thử nghiệm: trong ứng dụng vào Thêm, Cài đặt ứng dụng, chạm 7 lần vào dòng "HeartOS 1.0.0" (tài khoản quản trị) để mở Cài đặt kỹ thuật, nhập địa chỉ máy chủ rồi bấm Kiểm tra và lưu.

## Biến môi trường

| Biến | Ý nghĩa | Mặc định |
| --- | --- | --- |
| ANTHROPIC_API_KEY | Khóa Claude | trống |
| OPENAI_API_KEY | Khóa ChatGPT | trống |
| PRIMARY | `messages` để Claude làm chính, `responses` để ChatGPT làm chính | messages |
| CLAUDE_MODEL | Mô hình Claude | claude-opus-5-5 |
| OPENAI_MODEL | Mô hình ChatGPT | gpt-6-astra |
| OPENAI_FALLBACK_MODEL | Mô hình ChatGPT thay thế khi tài khoản chưa dùng được mô hình chính | gpt-5.5 |
| EFFORT | Mức suy nghĩ: low, medium, high | low |
| GATEWAY_SECRET | Khóa ký mã thiết bị, giữ bí mật và không đổi | bắt buộc |
| DEVICE_DAILY_LIMIT | Số câu hỏi tối đa mỗi điện thoại mỗi ngày | 150 |
| GLOBAL_DAILY_LIMIT | Tổng số câu hỏi mỗi ngày của cả hệ thống | 5000 |
| ACTIVATION_CODES | Danh sách mã kích hoạt, cách nhau bằng dấu phẩy. Để trống thì máy nào cũng đăng ký được | trống |
| ALLOWED_ORIGINS | Nguồn được gọi máy chủ | ứng dụng Android |
| ADMIN_TOKEN | Mã quản trị để xem số liệu và chặn thiết bị | trống |
| DATA_FILE | Tệp lưu số liệu sử dụng | trống |

## Quản trị

Xem số câu hỏi hôm nay:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://ai.ten-mien-cua-ban.vn/admin/usage
```

Chặn một thiết bị:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"device":"dev-..."}' https://ai.ten-mien-cua-ban.vn/admin/revoke
```

## Lưu ý pháp lý

Câu hỏi của khách được gửi tới nhà cung cấp AI ở nước ngoài. Theo quy định bảo vệ dữ liệu cá nhân của Việt Nam, chính sách quyền riêng tư của sản phẩm cần nêu việc dữ liệu được xử lý bởi đối tác AI đám mây và có thể chuyển ra nước ngoài. Ứng dụng đã có câu thông báo chung trong mục Trợ lý AI; bạn nên đưa nội dung tương tự vào điều khoản sử dụng khi bán.
