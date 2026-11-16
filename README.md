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
- **Trợ lý AI**: hỏi tự do bằng chữ hoặc giọng nói. Trợ lý xem việc, lịch, thiết bị, tìm địa điểm và tính đường, rồi đề xuất việc, lệnh thiết bị, cảnh, chỉ đường, cuộc gọi, lời mời dưới dạng thẻ chờ người dùng bấm duyệt. Chạy bằng Claude hoặc ChatGPT qua máy chủ HeartOS AI, khách không thấy tên nhà cung cấp.
- **GenAI theo sơ đồ hoạt động**: soạn lời mời, lựa lời khi bất đồng, tóm tắt lời kể thành bản nháp ký ức, bản tin gia đình hằng tuần, gợi ý thấu cảm Nhịp Nhà (gọi hỏi thăm, bữa cơm, nếp nhà). Mọi bản nháp qua kiểm lược đồ JSON, kiểm tiếng Việt có dấu, chưa đạt thì dùng mẫu trên thiết bị, người dùng xem và sửa trước khi gửi.
- **Bản đồ và chỉ đường**: bản đồ vector OpenStreetMap cập nhật hằng tuần, nhãn tiếng Việt, lớp vệ tinh và 3D, tìm địa điểm, danh mục quanh đây, chỉ đường xe máy, ô tô, đi bộ, xe đạp với tuyến thay thế, dẫn đường từng bước có giọng nói, tự tìm đường mới khi đi lệch, dùng được khi mất mạng với vùng đã lưu.
- **Việc chung, Nghi thức, Ký Ức Số, Quỹ Nếp Nhà**.
- **Hộ gia đình thật**: mỗi nhà tự tạo hộ, thêm người thân, người thân tham gia từ điện thoại riêng bằng mã của hub. Việc, lời mời, ký ức, quỹ, quyền chia sẻ và ca SOS đồng bộ qua hub trong mạng nhà.
- **Thiết bị qua Home Assistant**: đèn, ổ cắm, rèm, điều hòa, khóa, van, còi, cảm biến cửa/khói/khí/nước, nút SOS, camera, UPS, radar LD2450 và cảm biến nhiệt MLX90640. Lệnh theo quyền trong hộ, trạng thái chỉ đổi khi thiết bị xác nhận.
- **Guardian**: radar thấy tăng tốc đột ngột rồi bất động từ 30 giây thì mở ca nghi ngã cần xác minh, ảnh nhiệt thêm bằng chứng. Khói, rò nước, nút SOS tự mở ca.
- **SOS thật**: lấy vị trí GPS, soạn sẵn tin nhắn SMS kèm bản đồ cho người thân, nút gọi từng người và gọi 115, người thân nhận ca và bấm "Tôi đang tới" từ điện thoại của họ.
- **Tài khoản Expo**: nhà mẫu để trưng bày. Kết thúc trải nghiệm là xóa toàn bộ dữ liệu khách vừa tạo và đặt lại nhà mẫu cho khách sau.
- **ARGOLET Sentinel**: hiện thực lớp bảo mật chính trong luận văn "Nghiên cứu phát triển hệ thống bảo mật ARGOLET Sentinel" bằng WebCrypto. Phần nguồn entropy đang nghiên cứu được chuẩn bị sẵn thành mô-đun riêng, chưa tích hợp.
- Hai chế độ hiển thị: **Thân Quen** (chữ lớn, cho ông bà) và **Gia Đình**, cùng **Bàn vận hành** cho máy tính.

Giao diện theo bản thiết kế "Giao diện HeartOS" (Bản xem thử 03) và sơ đồ hoạt động 8 khối: dữ liệu đầu vào, xử lý, phân tích và tạo sinh, xác minh và duyệt, kết quả, cùng hai chế độ Replay và Live.

## Cài đặt cho người dùng

### Điện thoại Android

1. Chép `HeartOS-1.0.0.apk` vào điện thoại.
2. Mở tệp, cho phép "Cài ứng dụng không rõ nguồn gốc" khi được hỏi.
3. Yêu cầu Android 7.0 trở lên.

Ghi âm lời kể cần quyền micro, gửi SOS kèm vị trí cần quyền vị trí. Ứng dụng hỏi ở lần dùng đầu tiên.

### Máy tính quản trị Sentinel

- **Windows**: chạy `HeartOS-Sentinel-Admin-1.0.0-portable.exe` (không cần cài) hoặc giải nén `HeartOS-Sentinel-Admin-1.0.0-win-x64.zip` rồi mở `HeartOS Sentinel Admin.exe`. Windows SmartScreen có thể cảnh báo vì tệp chưa ký số, chọn "More info" rồi "Run anyway".
- **Linux**: `chmod +x HeartOS-Sentinel-Admin-1.0.0-x86_64.AppImage` rồi chạy, hoặc cài gói deb:

```bash
sudo apt install ./HeartOS-Sentinel-Admin-1.0.0-amd64.deb
```

Lần đầu mở, Windows Firewall có thể hỏi quyền mạng. Chọn cho phép trong mạng riêng (Private) để điện thoại trong nhà kết nối được tới cổng 7420.

## Bắt đầu cho một gia đình

1. Người quản trị mở ứng dụng, chọn **Bắt đầu sử dụng**, nhập họ tên và số điện thoại. Ứng dụng tạo khóa truy cập trên điện thoại (passkey của hệ thống hoặc khóa thiết bị không xuất được).
2. Chọn **Tạo hộ mới**, đặt tên nhà. Người tạo là quản trị hộ.
3. Vào **Thêm > Thành viên và vai trò > Thêm thành viên** để thêm ông bà, cha mẹ, con cháu: số điện thoại (dùng cho SOS và gọi), cách xưng hô, cách dùng ứng dụng (Gia Đình hoặc Thân Quen chữ lớn).
4. Ghép điện thoại quản trị với máy quản trị Sentinel (mục dưới) để đưa hồ sơ hộ lên hub.
5. Người thân dùng điện thoại riêng: trên máy quản trị chọn **Ghép thiết bị mới**, chọn đúng tên người đó, bấm **Tạo mã**. Người thân mở ứng dụng, tạo tài khoản, chọn **Tham gia bằng mã**, nhập địa chỉ hub và mã.

Một người dùng điện thoại chung với người khác (ví dụ ông bà) thì không cần tham gia riêng: quản trị chỉ cần thêm hồ sơ và chọn cách dùng Thân Quen.

### Ghép điện thoại với máy quản trị

1. Trên máy tính: **Ghép thiết bị mới**, để mục chọn là **Điện thoại quản trị hộ**, bấm **Tạo mã**. Màn hình hiện địa chỉ LAN (ví dụ `192.168.1.10:7420`) và mã 6 chữ số, mã có hạn 2 phút và cho tối đa 5 lần thử.
2. Trên điện thoại: **Thêm > Máy quản trị Sentinel**, nhập địa chỉ và mã, bấm **Ghép nối**.
3. So **mã đối chiếu** trên hai màn hình. Nếu trùng nhau thì kênh đã an toàn, nếu khác thì gỡ ghép và làm lại.

Mã tạo cho một thành viên cụ thể là **mã tham gia hộ**: điện thoại dùng mã này được gắn với đúng hồ sơ đó và chỉ nhận dữ liệu người đó được phép xem. Thu hồi quyền chia sẻ thì hub ngừng gửi và báo các máy xóa bản đã nhận.

Sau khi ghép, điện thoại tự đồng bộ mỗi 5 giây khi ứng dụng đang mở. Máy quản trị xem được trạng thái Sentinel, nhật ký bằng chứng (đã kiểm lại chuỗi băm), thiết bị nhà, sự cố, và gửi lệnh có chữ ký: kiểm tra kết nối, thu hồi khẩn cấp (tăng thế hệ quyền), khóa hoặc mở đường đọc trong két, hạn chế phiên thành viên, gửi tín hiệu nghi vấn, niêm phong điểm phục hồi, kiểm chuỗi bằng chứng, thu hồi một quyền chia sẻ, cấu hình hạn mức giải mã (B, r), chạy 12 kịch bản T1 đến T7, đổi chế độ nhà, đóng ca Guardian, gỡ ghép. Lệnh hết hạn sau 15 phút nếu thiết bị chưa nhận.

### Hub không giao diện

```bash
node heartos-hub.cjs --pair
```

Tùy chọn: `--port 7420`, `--data <thư mục>` (mặc định `~/.heartos-hub`). Lệnh `--pair` in mã ghép điện thoại quản trị ra màn hình. Khi đang chạy, gõ `members` để xem mã thành viên, `pair <mã thành viên>` để tạo mã tham gia hộ cho người đó, `devices` để xem điện thoại đã ghép.

## Kết nối thiết bị qua Home Assistant

HeartOS dùng [Home Assistant](https://www.home-assistant.io) làm cầu nối tới thiết bị Zigbee, Wi-Fi, Matter và ESPHome, nên dùng được với hầu hết thiết bị bán ở Việt Nam.

1. Cài Home Assistant tại nhà (Home Assistant Green, Raspberry Pi hoặc mini PC) và thêm thiết bị vào đó như bình thường.
2. Gán **Khu vực** cho từng thiết bị trong Home Assistant. HeartOS chia thiết bị theo phòng từ Khu vực này.
3. Trong Home Assistant: **Hồ sơ > Bảo mật > Mã truy cập dài hạn > Tạo mã**.
4. Trên điện thoại quản trị: **An toàn > Thiết bị và điện dự phòng > Home Assistant** (hoặc **Thêm > Home Assistant**), nhập địa chỉ (ví dụ `http://192.168.1.10:8123`) và mã, bấm **Kiểm tra** rồi **Lưu và kết nối**.

Điện thoại đọc trạng thái mỗi 3 giây khi ứng dụng mở. Mã truy cập chỉ lưu trên điện thoại đó và được mã hóa khi lưu. Điện thoại khác muốn điều khiển thiết bị cần kết nối riêng, nên chỉ cấp mã cho người được phép.

| Thiết bị trong Home Assistant | HeartOS hiểu là |
|---|---|
| `light.*` | Đèn (bật tắt, độ sáng, ánh sáng ấm/lạnh nếu đèn hỗ trợ) |
| `switch.*` | Ổ cắm; tên có "còi" hoặc "siren" là còi, có "van" hoặc "valve" là van nước |
| `cover.*`, `climate.*`, `lock.*`, `valve.*`, `siren.*`, `camera.*` | Rèm, điều hòa, khóa cửa, van, còi, camera |
| `binary_sensor` loại smoke, gas, carbon_monoxide | Cảm biến khói/khí, bật lên là mở ca khẩn P1 |
| `binary_sensor` loại moisture | Cảm biến nước, mở ca P2 |
| `binary_sensor` loại door, window, opening | Cảm biến cửa, báo khi chế độ Vắng nhà |
| `binary_sensor` có chữ "sos" trong tên | Nút SOS, mở ca khẩn P1 |
| `binary_sensor` loại motion, occupancy, presence | Cảm biến hiện diện |
| `sensor.<tên>_target_N_x`, `_y`, `_speed` (ESPHome LD2450) | Radar Guardian, vẽ mục tiêu và phát hiện nghi ngã |
| `sensor` có "mlx90640" hoặc "thermal" trong tên, đơn vị °C | Nhiệt độ đỉnh của cảm biến nhiệt |
| `sensor` có "ups" trong tên, loại battery | Pin UPS |
| `scene.*`, `script.*`, `automation.*` | Cảnh, kịch bản, luật tự động (bật tắt và chạy ngay) |

Mở khóa cửa luôn cần ký xác nhận bằng khóa phê duyệt trên điện thoại. Xem camera cần Sentinel cấp quyền cho từng phiên, tối đa 4 phút; quản trị hộ chọn ai được xem từng camera.

Dùng HeartOS trên trình duyệt (không phải APK) thì cần cho phép địa chỉ trang trong `configuration.yaml` của Home Assistant:

```yaml
http:
  cors_allowed_origins:
    - http://192.168.1.20:5173
```

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
| Cận dữ liệu phát hành mới K2, Bảng 4.1 | Hàm thuần, có test tái lập bảng | `bounds.ts` |
| T1 đến T7, I1 đến I11, A1 đến A10, K1 đến K3, Phụ lục B, D | 12 kịch bản chạy trên sandbox bằng mã thật | `threats.ts`, `invariants.ts` |
| Khóa phê duyệt trên thiết bị (mục 3.8.2) | ECDSA không xuất được, ký đúng nội dung hiển thị, đích, nonce, hạn và epoch | `state/services.ts`, `lib/ui-store.ts` |

Mọi khóa, nonce và mã chống dùng lại lấy từ CSPRNG của hệ điều hành qua WebCrypto. Không thành phần nào của lớp bảo mật chính phụ thuộc vào nguồn entropy nghiên cứu.

Dữ liệu được Sentinel bảo vệ trong ứng dụng: lịch rảnh/bận được chia sẻ, lời kể và bản ghi âm (mã hóa phong bì), chi tiết khoản góp quỹ, vị trí hỗ trợ khi SOS, chính sách xem camera. Thu hồi quyền làm tăng epoch, grant cũ bị cổng loại, lời mời đang chờ bị chặn ("Cần duyệt lại"), thiết bị ngoại tuyến hiện trạng thái chờ áp dụng.

### Mã hóa dữ liệu khi lưu

Toàn bộ dữ liệu ứng dụng lưu trên thiết bị (trạng thái ứng dụng, mã thiết bị trợ lý AI, trạng thái R, nhật ký Sentinel, SmartHome, liên kết hub) được mã hóa AES-256-GCM trước khi ghi xuống localStorage (`src/core/atrest.ts`):

- Khóa tạo một lần, không xuất được, giữ trong IndexedDB cùng chỗ với KEK của HSM.
- Mỗi giá trị gắn AAD theo tên khóa lưu, nên bản mã của mục này không dán sang mục khác được.
- Bản mã bị sửa hoặc không giải được thì bị bỏ, không làm ứng dụng lỗi.
- Dữ liệu dạng rõ chỉ được nhận một lần khi nâng cấp từ bản cũ (lúc khóa vừa được tạo). Sau đó dữ liệu dạng rõ chèn từ ngoài vào bị từ chối.
- Ghi tuần tự theo từng mục, luôn giữ bản mới nhất.

## Mô-đun entropy ARGOLET (chuẩn bị sẵn, chưa tích hợp)

Phần nguồn entropy hóa lý đang trong giai đoạn nghiên cứu nên được tách thành mô-đun riêng `src/core/entropy/`. Ứng dụng, phần mềm quản trị và APK hiện **không** nạp mô-đun này.

| Tệp | Nội dung |
|---|---|
| `sources.ts` | Danh mục nguồn (camera + hỗn hợp chất lỏng H1, microplasma H2, giả thuyết H3), hồ sơ Phụ lục C, cổng phê duyệt (AI không mở được, hồ sơ phải đủ, construction phải được thẩm định, đổi firmware làm mất phê duyệt), kiểm tra sức khỏe RCT/APT theo SP 800-90B và phát hiện phát lại khung |
| `math.ts` | p_guess, H_min, cận bộ trích xuất two-universal, Bảng A.1, ngưỡng RCT/APT |
| `provider.ts` | Điểm cắm khi tích hợp: `EntropyProvider`, `gatedProvider` (chỉ đọc khi cổng mở, firmware khớp bản đã duyệt và mỗi lần đọc đều qua kiểm tra sức khỏe), `drawSeed` ghép bằng HKDF-SHA-256 với phần từ CSPRNG hệ điều hành luôn có mặt và dài bằng đầu ra |
| `entropy.test.ts` | Kiểm thử bảng, kiểm tra sức khỏe, cổng nguồn và phép ghép |

Nguyên tắc khi tích hợp sau này: nguồn nghiên cứu chỉ **bổ sung**, không thay CSPRNG hệ điều hành. Nguồn lỗi hoặc bị đóng thì `drawSeed` tự quay về CSPRNG hệ điều hành và báo lý do, nên lớp bảo mật chính không yếu đi vì nguồn nghiên cứu.

## Phát triển

```bash
npm install
```

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | Chạy bản phát triển, mở được từ điện thoại cùng mạng LAN |
| `npm test` | 113 bài kiểm thử đơn vị (thêm 20 hành trình thật khi đặt NET=1) |
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

## Trợ lý AI và GenAI

Ứng dụng gọi Claude (SDK `@anthropic-ai/sdk`, mặc định `claude-opus-5-5`, có dự phòng phía máy chủ khi mô hình từ chối) và ChatGPT (SDK `openai`, Responses API) qua **máy chủ HeartOS AI** trong thư mục `server/`. Khóa API chỉ nằm trên máy chủ, không nằm trong APK. Hướng dẫn triển khai xem `server/README.md`.

- Build bản bán ra với `VITE_AI_GATEWAY=https://ai.ten-mien-cua-ban.vn` để khách cài là dùng được ngay.
- Máy trưng bày hoặc kỹ thuật viên: Thêm, Cài đặt ứng dụng, chạm 7 lần vào "HeartOS 1.0.0" bằng tài khoản quản trị để mở Cài đặt kỹ thuật, nhập địa chỉ máy chủ. Mục này cũng cho nhập khóa API trực tiếp để thử, không dùng cho máy bán.
- Chưa có máy chủ thì trợ lý dùng mẫu trên thiết bị, vẫn hiểu các câu đơn giản (soạn lời mời, nhắc việc, mở SOS).
- Gắn khóa thẳng vào bản cài khi chưa có máy chủ: build với `HEARTOS_EMBED_CLAUDE_KEY` và/hoặc `HEARTOS_EMBED_OPENAI_KEY` (tùy chọn `HEARTOS_EMBED_PRIMARY=openai`). Khóa được mã hóa khi build, chỉ giải mã trong bộ nhớ lúc gọi, không hiện ở màn hình nào và không lưu xuống máy; giao diện không hiện tên nhà cung cấp. Đây là làm khó chứ không chặn hẳn: người rành kỹ thuật vẫn có thể lấy khóa từ APK, nên dùng khóa riêng có hạn mức chi tiêu hằng tháng và đổi khóa khi nghi bị lộ. Cách giấu khóa hoàn toàn là máy chủ HeartOS AI.
- Trợ lý chủ động: mở trợ lý là thấy tóm tắt hôm nay (sự cố đang mở, việc tới hạn và quá giờ, nếp nhà sắp tới, người lớn tuổi lâu chưa được hỏi thăm), bấm một chạm để hỏi tiếp hoặc mở màn liên quan. Phần này chạy cả khi không có mạng và không có khóa AI.
- Nhắc uống thuốc: Gia Đình, Nhắc uống thuốc. Nhập thuốc theo đơn (giờ, trước hay sau ăn, ngày uống, số viên còn lại). Đến giờ HeartOS nhắc và đọc to ở giao diện Thân Quen, quá 30 phút chưa uống thì báo người thân được chọn, còn dưới 5 ngày thuốc thì nhắc mua thêm. Trợ lý AI cũng thêm được lịch thuốc khi người dùng nói, nhưng phải bấm duyệt.
- Tự học thói quen: trợ lý ghi lại việc lặp lại (bật tắt thiết bị, việc nhà đã xong, cuộc gọi hỏi thăm) và nhận ra thói quen khi thấy cùng việc vào khoảng cùng giờ ít nhất 3 ngày, hoặc cùng thứ trong tuần ít nhất 3 tuần. Đến giờ thì nhắc, quá giờ chưa làm thì nhắc lại, lặp đủ lâu thì đề nghị tạo lịch tự động. Bỏ qua hai lần thì im 14 ngày. Xem, quên từng thói quen hoặc tắt trong Trợ lý AI, Thói quen trợ lý đã học. Dữ liệu chỉ nằm trên máy, đã mã hóa.
- Chủ động hỏi thăm: khi thấy người dùng loay hoay (bấm qua lại giữa vài màn hình, chạm nhiều lần vào chỗ không bấm được, nói mà máy không nhận ra), mở màn Cần giúp quá 25 giây mà chưa gửi SOS, quá giờ uống thuốc, hoặc cảm biến nghi ngã, HeartOS tự đọc to câu hỏi theo đúng xưng hô (với bà: "Bà ơi, con thấy bà đang tìm gì đó. Dạ, con có thể giúp được gì không ạ?") rồi nghe câu trả lời. Nói "tôi ổn" thì cảm ơn và thôi, nói "có" thì mở trò chuyện bằng giọng nói, nói luôn điều cần thì trợ lý làm ngay. Nghi ngã mà người dùng xin giúp hoặc không trả lời sau 60 giây thì gửi SOS. Từ 22 giờ đến 6 giờ chỉ hiện chữ, trừ khi nghi ngã. Bật tắt trong Trợ lý AI, Chủ động hỏi thăm.
- Trò chuyện bằng giọng nói: nút ở màn hình chính Thân Quen và nút sóng âm cạnh micro trong trợ lý. Nghe, trả lời bằng giọng nói rồi nghe tiếp, chạm vòng tròn để ngắt lời. Duyệt thẻ đề xuất bằng cách nói "đồng ý". Nói "thôi" hoặc "tạm biệt" để kết thúc. Nghe thấy "cứu", "bị ngã", "khó thở" thì hỏi lại rồi gửi SOS. Không có mạng vẫn trả lời được lịch hôm nay, lịch thuốc, giờ, gọi người nhà, đường về nhà.
- Lịch sử hội thoại với Claude được giữ nguyên thứ tự chỉ thêm vào cuối, ngữ cảnh từng lượt nằm trong tin nhắn người dùng, nên khối suy nghĩ của mô hình không bị vô hiệu.
- Người dùng chọn dữ liệu trợ lý được dùng: việc và lịch, thiết bị và an toàn, vị trí hiện tại.

## Bản đồ và chỉ đường

| Phần | Dịch vụ mặc định | Đổi bằng |
| --- | --- | --- |
| Bản đồ vector | OpenFreeMap (dữ liệu OpenStreetMap, cập nhật hằng tuần) | `src/core/maps/config.ts` |
| Ảnh vệ tinh | Esri World Imagery | `VITE_SATELLITE_TILES`, `VITE_SATELLITE_ATTRIBUTION` |
| Chỉ đường | Valhalla (FOSSGIS), dự phòng OSRM | `src/core/maps/config.ts` |
| Tìm địa điểm | Photon, dự phòng Nominatim | `src/core/maps/config.ts` |

- Khi dẫn đường: bản đồ xoay theo hướng đường phía trước và nghiêng 3D, mũi tên vị trí màu xanh chỉ hướng đang đi, đoạn đã đi chuyển màu xám, mũi tên rẽ màu trắng vẽ ngay tại ngã rẽ tiếp theo (trong vòng 450 m), tên đường đang đi hiện ở dưới, phóng to dần khi tới gần chỗ rẽ.
- Hướng dẫn rẽ do HeartOS tự viết bằng tiếng Việt từ loại thao tác của máy chủ chỉ đường (rẽ, rẽ nhẹ, quay đầu, vòng xoay có số lối ra, nhập làn, lên và rời phà, nơi đến bên trái hoặc phải).
- Khi mất mạng: vùng quanh nhà được tự tải về (bán kính khoảng 6 km), người dùng tải thêm vùng đang xem trong Lớp bản đồ, Bản đồ ngoại tuyến. Tuyến đã tìm được lưu lại để dùng khi mất mạng, đang dẫn đường thì vẫn tiếp tục theo GPS. Chưa có tuyến thì hiện hướng và khoảng cách đường chim bay.
- Kiểm thử: `src/core/maps/maps.test.ts` (giải mã tuyến, câu hướng dẫn, bám tuyến, phát hiện đi lệch, nhắc giọng nói). `NET=1 NODE_USE_ENV_PROXY=1 npx vitest run src/core/maps/route.net.test.ts` chạy 20 hành trình thật ở Sài Gòn, Hà Nội, Đà Nẵng với 4 cách đi, mô phỏng GPS đi hết tuyến.
- Các dịch vụ công cộng ở trên có chính sách dùng hợp lý. Khi số khách lớn nên tự dựng Valhalla, Photon và kho bản đồ, hoặc dùng gói trả phí. Ảnh vệ tinh Esri cho mục đích thương mại cần tài khoản ArcGIS Location Platform (có gói miễn phí), đặt địa chỉ ảnh kèm khóa vào `VITE_SATELLITE_TILES`.

## Giới hạn

- Thiết bị trong nhà cần Home Assistant. Chưa kết nối thì các màn thiết bị, Guardian và camera hiện hướng dẫn kết nối, không hiện số liệu giả.
- SOS tới điện thoại người thân qua hub chỉ đến được khi ứng dụng trên máy đó đang mở và cùng mạng nhà (chưa có thông báo đẩy khi ứng dụng tắt). Kênh luôn đến được là tin nhắn SMS soạn sẵn kèm vị trí và nút gọi điện. HeartOS **không** tự gọi cấp cứu, màn SOS có nút gọi 115.
- Nhà mẫu chỉ có trong tài khoản Expo. Máy đã có hộ thật thì không hiện nút Expo để tránh xóa nhầm dữ liệu.
- "Enclave" và "HSM" là ranh giới mô-đun trong ứng dụng với khóa không xuất được. Thuộc tính mật mã là thật nhưng không có cách ly phần cứng. Triển khai thật cần TEE/HSM theo hồ sơ cấu hình C (Phụ lục D).
- Danh sách bệnh viện do từng nhà tự nhập hoặc thêm từ bản đồ. Chỉ đường cần mạng để tìm tuyến lần đầu.
- Dữ liệu ứng dụng lưu trên thiết bị và được mã hóa khi lưu. Đồng bộ giữa các máy đi qua hub trong mạng LAN.
- Khóa mã hóa khi lưu nằm trong kho của ứng dụng trên thiết bị. Người chiếm quyền root của máy vẫn có thể đọc được; muốn chống trường hợp này cần thêm khóa ứng dụng bằng PIN hoặc sinh trắc học.

Font Inter dùng giấy phép SIL Open Font License 1.1 (`src/assets/fonts/OFL.txt`).
