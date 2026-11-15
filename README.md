# HeartOS — Quản gia số thông minh cho gia đình

Giữ nếp nhà · Kết nối đúng lúc · Hỗ trợ khi cần.

HeartOS là ứng dụng (PWA, cài được trên Android/iOS và chạy trên trình duyệt) cho gia đình nhiều thế hệ:

- **Nhịp Nhà**: đọc khoảng rảnh/bận *đã được chia sẻ* (qua Sentinel), cắt theo giờ yên tĩnh, tìm khung chung.
- **GenAI**: soạn lời mời theo từng người nhận và ngôn ngữ, kiểm schema + dữ kiện, **chờ người dùng duyệt**, kiểm lại quyền khi phát hành.
- **Việc chung, Nghi thức, Ký Ức Số, Quỹ Nếp Nhà**.
- **Guardian**: radar LD2450 + ảnh nhiệt MLX90640 ghép theo vùng → ca "nghi ngã" cần xác minh; SOS báo tại nhà → kênh từ xa → người hỗ trợ → so tuyến bệnh viện → chốt đích bàn giao.
- **SmartHome**: hub tại nhà, lệnh theo quyền hộ và **chỉ đổi trạng thái khi thiết bị xác nhận**, cảnh, luật tự động, ghép thiết bị, UPS/máy phát/ATS, chế độ mất Internet.
- **ARGOLET Sentinel**: hiện thực mô hình của luận văn *"Nghiên cứu phát triển hệ thống bảo mật ARGOLET Sentinel"* bằng WebCrypto thật.
- Hai chế độ hiển thị: **Thân Quen** (chữ lớn, cho ông bà) và **Gia Đình**; cùng **Bàn vận hành** (desktop).

> Giao diện bám theo bản thiết kế `Giao diện HeartOS` (Bản xem thử 03) và sơ đồ hoạt động 8 khối (dữ liệu đầu vào → xử lý → phân tích & tạo sinh → xác minh & duyệt → kết quả, Replay/Live).

## Chạy

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build && npm run preview
```

Mở trên điện thoại cùng mạng LAN (`npm run dev` in ra địa chỉ `Network`) rồi chọn **Thêm vào màn hình chính** để cài như ứng dụng. Bản build dùng đường dẫn tương đối nên đặt được trên bất kỳ máy chủ tĩnh nào (GitHub Pages, hub nội bộ…). Nếu cần gói `.apk`, có thể bọc thư mục `dist/` bằng Capacitor (`npx cap add android`) — chưa kèm trong repo.

## ARGOLET Sentinel trong mã nguồn

| Luận văn | Hiện thực | Tệp |
|---|---|---|
| Chủ thể A, G, Ve, K/H, R, B, J, AI (Bảng 3.1) | lớp riêng cho từng chủ thể, ghép trong `Sentinel` | `src/core/sentinel/*` |
| AEAD + AAD = Encode(tenant, object, version, type) (3.11–3.12) | AES-256-GCM, nonce 96 bit, mã hóa AAD có tiền tố độ dài | `crypto.ts`, `encoding.ts` |
| HSM giữ KEK, không xuất; chỉ cổng cấp khóa gọi được | KEK AES-KW không xuất được (IndexedDB), danh tính dịch vụ của cổng, luân chuyển + bọc lại | `hsm.ts` |
| Chứng thực enclave, khóa phiên, trình xác minh (A5, A6, I8) | khóa phiên ECDH không xuất được, báo cáo ký bởi gốc nền tảng, thử thách một lần, allowlist/TCB/debug/thu hồi | `enclave.ts` |
| Grant ký bởi G gắn chủ thể, đối tượng, trường, đích nhận, hạn, nonce, hạn mức, epoch (§3.7) | ECDSA P-256 trên JSON chuẩn hóa; PDP lấy vai trò/tenant từ nguồn thuộc tính | `grant.ts` |
| **ReleaseDEK ⇒ Gok ∧ Aok ∧ Eok ∧ Bok** (3.13) | cổng cấp khóa đánh giá từng điều kiện; DEK chỉ đi dưới dạng bọc cho khóa nhận (kiểu CiphertextForRecipient) | `gate.ts` |
| R: epoch, chống dùng lại, token bucket B + rT, đặt chỗ nguyên tử, chống lùi (I3, I4, I9) | `checkAndReserve`, `restoreSnapshot` (epoch = max, ngân sách = min), crash không hoàn ngân sách | `state.ts` |
| Đầu ra niêm phong cho đích đã xác minh (A8) | ECIES (ECDH + HKDF + AES-GCM) tới khóa của client | `crypto.ts`, `enclave.ts` |
| Recovery Vault, manifest, khóa lưu giữ, phục hồi 3 bước có thẩm quyền (I6, I10) | `RecoveryVault` + `Sentinel.recoveryStep1/2/Approve` | `recovery.ts` |
| Bằng chứng: chuỗi băm, root Merkle, bản giảm nhạy cảm cho AI | `Journal` | `journal.ts` |
| Trạng thái sự cố (Hình 3.3), nguồn tách khỏi xâm nhập | `IncidentMachine` | `incident.ts` |
| AI chỉ đề xuất; bộ thực thi độc lập (I5) | luật cục bộ + `checkExecution` (allowlist, phạm vi, TTL, hoàn tác, người duyệt) | `ai.ts` |
| Cổng phê duyệt nguồn, hồ sơ Phụ lục C, H1–H3, kiểm tra sức khỏe | RCT/APT (SP 800-90B) + phát hiện phát lại khung | `source.ts` |
| p_guess, H_min, bộ trích xuất, cận đầu ra (3.4–3.10, 3.14–3.15), Bảng 4.1, A.1 | hàm thuần, có test tái lập bảng | `math.ts` |
| T1–T7, I1–I11, A1–A10, K1–K3, Phụ lục B, D | 12 kịch bản chạy trên sandbox bằng mã thật | `threats.ts`, `invariants.ts` |
| Khóa phê duyệt trên thiết bị (§3.8.2) | ECDSA không xuất được ký đúng nội dung hiển thị + đích + nonce + hạn + epoch | `state/services.ts`, `lib/ui-store.ts` |

Dữ liệu được Sentinel bảo vệ trong app: lịch rảnh/bận được chia sẻ, lời kể và khóa bản ghi âm (mã hóa phong bì), chi tiết khoản góp quỹ, vị trí hỗ trợ khi SOS, chính sách xem camera. Thu hồi quyền tăng epoch → grant cũ bị cổng loại, lời mời đang chờ bị chặn ("Cần duyệt lại"), thiết bị ngoại tuyến hiển thị chờ áp dụng.

## Kiểm thử

- `npm test` — 34 bài: đường đọc/ghi Sentinel, thu hồi, chuỗi bằng chứng, Bảng 4.1/A.1, kiểm tra sức khỏe nguồn, **12 kịch bản T1–T7**, vòng đời lệnh SmartHome, phát hiện ngã radar–nhiệt, SOS online/offline, ATS, so tuyến, giao lịch F.8, GenAI kiểm dữ kiện, lịch lặp.
- Trong app: **Bàn vận hành → Kịch bản T1–T7** chạy lại toàn bộ kịch bản trên trình duyệt; **Replay** đối chiếu F.8 với một oracle độc lập.

## GenAI (tùy chọn)

Mặc định lời mời được soạn bằng mẫu trên thiết bị. Trong *Thêm → Cài đặt ứng dụng* có thể bật Claude bằng khóa API của chính người dùng (lưu trên thiết bị, gọi thẳng `api.anthropic.com` qua SDK chính thức, structured output theo schema zod, bật server-side fallback). Chỉ dữ kiện tối thiểu được gửi; bản nháp vẫn qua kiểm dữ kiện, chưa đạt thì dùng mẫu.

## Giới hạn cần biết

- Hub, cảm biến, kênh SOS từ xa và nhà cung cấp là **mô phỏng** (nhãn *MÔ PHỎNG*). SOS **không** gọi dịch vụ cấp cứu; màn SOS có nút gọi 115.
- "Enclave" và "HSM" là ranh giới mô-đun trong trình duyệt với khóa không xuất được; thuộc tính mật mã là thật nhưng không có cách ly phần cứng. Triển khai thật cần TEE/HSM theo hồ sơ cấu hình C (Phụ lục D).
- Bản đồ tuyến là đồ thị minh họa; nút "Mở bản đồ thật" mở Google Maps theo địa chỉ cấu hình.
- Dữ liệu lưu cục bộ (localStorage + IndexedDB); chưa có máy chủ đồng bộ nhiều thiết bị.

Font Inter — SIL Open Font License 1.1 (`src/assets/fonts/OFL.txt`).
