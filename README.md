# HeartOS

Quản gia số cho gia đình nhiều thế hệ: giữ nếp nhà, kết nối đúng lúc, hỗ trợ khi cần.

Bộ phần mềm gồm ba phần:

| Thành phần | Chạy trên | Vai trò |
|---|---|---|
| Ứng dụng HeartOS | Android (APK), trình duyệt, cài như PWA | Ứng dụng cho các thành viên trong nhà |
| HeartOS Sentinel Admin | Windows, Linux (macOS cần build trên máy Mac) | Phần mềm quản trị Sentinel trên máy tính, làm hub trong mạng LAN |
| heartos-hub | Node.js 20 trở lên | Hub chạy không giao diện, dùng cho máy chủ nhỏ hoặc Raspberry Pi |

## Tính năng chính

- **Nhịp Nhà**: đọc khoảng rảnh/bận mà từng người đã chia sẻ (qua Sentinel), cắt theo giờ yên tĩnh và tìm khung giờ chung.
- **GenAI**: soạn lời mời theo từng người nhận và ngôn ngữ, kiểm schema và dữ kiện, chờ người dùng duyệt, kiểm lại quyền khi phát hành.
- **Việc chung, Nghi thức, Ký Ức Số, Quỹ Nếp Nhà**.
- **Guardian**: ghép radar LD2450 với ảnh nhiệt MLX90640 theo vùng để phát hiện ca nghi ngã cần xác minh. Luồng SOS đi từ báo động tại nhà, kênh từ xa, người hỗ trợ, so tuyến tới bệnh viện rồi chốt điểm bàn giao.
- **SmartHome**: hub tại nhà, lệnh theo quyền trong hộ, trạng thái chỉ đổi khi thiết bị xác nhận, cảnh, luật tự động, ghép thiết bị, UPS/máy phát/ATS, chế độ mất Internet.
- **ARGOLET Sentinel**: hiện thực mô hình trong luận văn "Nghiên cứu phát triển hệ thống bảo mật ARGOLET Sentinel" bằng WebCrypto.
- Hai chế độ hiển thị: **Thân Quen** (chữ lớn, cho ông bà) và **Gia Đình**, cùng **Bàn vận hành** cho máy tính.

Giao diện theo bản thiết kế "Giao diện HeartOS" (Bản xem thử 03) và sơ đồ hoạt động 8 khối: dữ liệu đầu vào, xử lý, phân tích và tạo sinh, xác minh và duyệt, kết quả, cùng hai chế độ Replay và Live.

## Cài đặt cho người dùng

### Điện thoại Android

1. Chép `HeartOS-1.0.0.apk` vào điện thoại.
2. Mở tệp, cho phép "Cài ứng dụng không rõ nguồn gốc" khi được hỏi.
3. Yêu cầu Android 7.0 trở lên.

Ghi âm lời kể cần quyền micro, ứng dụng sẽ hỏi ở lần dùng đầu tiên.

### Máy tính quản trị Sentinel

- **Windows**: chạy `HeartOS-Sentinel-Admin-1.0.0-portable.exe` (không cần cài) hoặc giải nén `HeartOS-Sentinel-Admin-1.0.0-win-x64.zip` rồi mở `HeartOS Sentinel Admin.exe`. Windows SmartScreen có thể cảnh báo vì tệp chưa ký số, chọn "More info" rồi "Run anyway".
- **Linux**: `chmod +x HeartOS-Sentinel-Admin-1.0.0-x86_64.AppImage` rồi chạy, hoặc cài gói deb:

```bash
sudo apt install ./HeartOS-Sentinel-Admin-1.0.0-amd64.deb
```

Lần đầu mở, Windows Firewall có thể hỏi quyền mạng. Chọn cho phép trong mạng riêng (Private) để điện thoại trong nhà kết nối được tới cổng 7420.

### Ghép điện thoại với máy quản trị

1. Trên máy tính: **Ghép thiết bị mới** rồi **Tạo mã ghép nối**. Màn hình hiện địa chỉ LAN (ví dụ `192.168.1.10:7420`) và mã 6 chữ số, mã có hạn 2 phút và cho tối đa 5 lần thử.
2. Trên điện thoại: **Thêm → Máy quản trị Sentinel**, nhập địa chỉ và mã, bấm **Ghép nối**.
3. So **mã đối chiếu** trên hai màn hình. Nếu trùng nhau thì kênh đã an toàn, nếu khác thì gỡ ghép và làm lại.

Sau khi ghép, điện thoại tự đồng bộ mỗi 5 giây khi ứng dụng đang mở. Máy quản trị xem được trạng thái Sentinel, nhật ký bằng chứng (đã kiểm lại chuỗi băm), thiết bị nhà, sự cố, và gửi lệnh có chữ ký: kiểm tra kết nối, thu hồi khẩn cấp (tăng thế hệ quyền), khóa hoặc mở đường đọc trong két, hạn chế phiên thành viên, gửi tín hiệu nghi vấn, niêm phong điểm phục hồi, kiểm chuỗi bằng chứng, thu hồi một quyền chia sẻ, cấu hình hạn mức giải mã (B, r), chạy 12 kịch bản T1 đến T7, đổi chế độ nhà, đóng ca Guardian, gỡ ghép. Lệnh hết hạn sau 15 phút nếu thiết bị chưa nhận.

### Hub không giao diện

```bash
node heartos-hub.cjs --pair
```

Tùy chọn: `--port 7420`, `--data <thư mục>` (mặc định `~/.heartos-hub`). Lệnh `--pair` in mã ghép nối ra màn hình.

## Giao thức HubLink

- Ghép nối: mã một lần 6 chữ số, so sánh thời gian hằng, mã đối chiếu SAS hiển thị trên cả hai bên.
- Mỗi bên có khóa ký ECDSA P-256. Khóa phiên lấy từ ECDH P-256 qua HKDF-SHA-256.
- Mọi gói tin được ký ECDSA và mã hóa AES-256-GCM, có số thứ tự chống phát lại và giới hạn lệch đồng hồ 10 phút.
- Hub kiểm lại chuỗi băm nhật ký bằng chứng nhận từ thiết bị trước khi lưu.
- Trên máy quản trị, khóa riêng của hub được bảo vệ bằng kho khóa của hệ điều hành (Electron safeStorage).

## ARGOLET Sentinel trong mã nguồn

| Luận văn | Hiện thực | Tệp |
|---|---|---|
| Chủ thể A, G, Ve, K/H, R, B, J, AI (Bảng 3.1) | Lớp riêng cho từng chủ thể, ghép trong `Sentinel` | `src/core/sentinel/*` |
| AEAD với AAD = Encode(tenant, object, version, type) (3.11, 3.12) | AES-256-GCM, nonce 96 bit, AAD mã hóa có tiền tố độ dài | `crypto.ts`, `encoding.ts` |
| HSM giữ KEK, không xuất, chỉ cổng cấp khóa gọi được | KEK AES-KW không xuất được (IndexedDB), danh tính dịch vụ của cổng, luân chuyển và bọc lại | `hsm.ts` |
| Chứng thực enclave, khóa phiên, trình xác minh (A5, A6, I8) | Khóa phiên ECDH không xuất được, báo cáo ký bởi gốc nền tảng, thử thách một lần, allowlist/TCB/debug/thu hồi | `enclave.ts` |
| Grant ký bởi G gắn chủ thể, đối tượng, trường, đích nhận, hạn, nonce, hạn mức, epoch (mục 3.7) | ECDSA P-256 trên JSON chuẩn hóa, PDP lấy vai trò và tenant từ nguồn thuộc tính | `grant.ts` |
| ReleaseDEK ⇒ Gok ∧ Aok ∧ Eok ∧ Bok (3.13) | Cổng cấp khóa đánh giá từng điều kiện, DEK chỉ đi dưới dạng bọc cho khóa nhận | `gate.ts` |
| R: epoch, chống dùng lại, token bucket B + rT, đặt chỗ nguyên tử, chống lùi (I3, I4, I9) | `checkAndReserve`, `restoreSnapshot` (epoch lấy max, ngân sách lấy min), crash không hoàn ngân sách | `state.ts` |
| Đầu ra niêm phong cho đích đã xác minh (A8) | ECIES (ECDH, HKDF, AES-GCM) tới khóa của client | `crypto.ts`, `enclave.ts` |
| Recovery Vault, manifest, khóa lưu giữ, phục hồi 3 bước có thẩm quyền (I6, I10) | `RecoveryVault` và `Sentinel.recoveryStep1/2/Approve` | `recovery.ts` |
| Bằng chứng: chuỗi băm, root Merkle, bản giảm nhạy cảm cho AI | `Journal` | `journal.ts` |
| Trạng thái sự cố (Hình 3.3), nguồn tách khỏi xâm nhập | `IncidentMachine` | `incident.ts` |
| AI chỉ đề xuất, bộ thực thi độc lập (I5) | Luật cục bộ và `checkExecution` (allowlist, phạm vi, TTL, hoàn tác, người duyệt) | `ai.ts` |
| Cổng phê duyệt nguồn, hồ sơ Phụ lục C, H1 đến H3, kiểm tra sức khỏe | RCT/APT theo SP 800-90B và phát hiện phát lại khung | `source.ts` |
| p_guess, H_min, bộ trích xuất, cận đầu ra (3.4 đến 3.10, 3.14, 3.15), Bảng 4.1, A.1 | Hàm thuần, có test tái lập bảng | `math.ts` |
| T1 đến T7, I1 đến I11, A1 đến A10, K1 đến K3, Phụ lục B, D | 12 kịch bản chạy trên sandbox bằng mã thật | `threats.ts`, `invariants.ts` |
| Khóa phê duyệt trên thiết bị (mục 3.8.2) | ECDSA không xuất được, ký đúng nội dung hiển thị, đích, nonce, hạn và epoch | `state/services.ts`, `lib/ui-store.ts` |

Dữ liệu được Sentinel bảo vệ trong ứng dụng: lịch rảnh/bận được chia sẻ, lời kể và bản ghi âm (mã hóa phong bì), chi tiết khoản góp quỹ, vị trí hỗ trợ khi SOS, chính sách xem camera. Thu hồi quyền làm tăng epoch, grant cũ bị cổng loại, lời mời đang chờ bị chặn ("Cần duyệt lại"), thiết bị ngoại tuyến hiện trạng thái chờ áp dụng.

## Phát triển

```bash
npm install
```

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | Chạy bản phát triển, mở được từ điện thoại cùng mạng LAN |
| `npm test` | 39 bài kiểm thử đơn vị |
| `npm run typecheck` | Kiểm kiểu cho ứng dụng và phần máy tính |
| `npm run build` | Build web vào `dist/` |
| `npm run desktop:dev` | Mở phần mềm quản trị từ mã nguồn |
| `npm run desktop:dist` | Đóng gói phần mềm quản trị vào `desktop/release/` |
| `npm run hub` | Build và chạy hub không giao diện |
| `npm run android:sync` | Build web và chép vào dự án Android |
| `npm run android:apk` | Build APK release |

### Ký APK

Tệp khóa ký không nằm trong repo. Tạo `keystore.properties` ở chỗ an toàn:

```properties
storeFile=heartos-release.jks
storePassword=...
keyAlias=heartos
keyPassword=...
```

`storeFile` tính tương đối theo thư mục chứa `keystore.properties`. Trỏ tới tệp này bằng biến môi trường `HEARTOS_KEYSTORE`, hoặc đặt nó ở `android/keystore.properties` (đã nằm trong `.gitignore`). Mọi bản cập nhật sau phải ký bằng cùng một khóa thì Android mới cho cài đè lên bản cũ.

```bash
HEARTOS_KEYSTORE=/duong/dan/keystore.properties npm run android:apk
```

APK nằm ở `android/app/build/outputs/apk/release/app-release.apk`. Cần JDK 21 và Android SDK (platform 36, build-tools 36).

### Đóng gói cho Windows và macOS

Trên Linux chỉ build được bản portable và zip cho Windows. Bộ cài NSIS cần chạy `npm run desktop:dist` trên Windows (hoặc có Wine), bản dmg cần chạy trên macOS.

## GenAI (tùy chọn)

Mặc định lời mời được soạn bằng mẫu trên thiết bị. Trong **Thêm → Cài đặt ứng dụng** có thể bật Claude bằng khóa API của chính người dùng. Khóa lưu trên thiết bị, ứng dụng gọi thẳng `api.anthropic.com` qua SDK chính thức với structured output theo schema zod. Chỉ dữ kiện tối thiểu được gửi đi. Bản nháp vẫn phải qua bước kiểm dữ kiện, chưa đạt thì dùng mẫu.

## Giới hạn

- Cảm biến, thiết bị nhà, kênh SOS từ xa và nhà cung cấp dịch vụ là **mô phỏng** (có nhãn MÔ PHỎNG). SOS **không** gọi dịch vụ cấp cứu, màn SOS có nút gọi 115.
- "Enclave" và "HSM" là ranh giới mô-đun trong ứng dụng với khóa không xuất được. Thuộc tính mật mã là thật nhưng không có cách ly phần cứng. Triển khai thật cần TEE/HSM theo hồ sơ cấu hình C (Phụ lục D).
- Bản đồ tuyến là đồ thị minh họa. Nút "Mở bản đồ thật" mở Google Maps theo địa chỉ đã cấu hình.
- Dữ liệu ứng dụng lưu trên thiết bị (localStorage và IndexedDB). Đồng bộ giữa các máy đi qua hub trong mạng LAN.

Font Inter dùng giấy phép SIL Open Font License 1.1 (`src/assets/fonts/OFL.txt`).
