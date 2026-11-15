export interface InvariantDef {
  id: string;
  title: string;
  condition: string;
  enforcedAt: string[];
  assumptions: string[];
}

export const INVARIANTS: InvariantDef[] = [
  { id: 'I1', title: 'Không đọc sai tenant hoặc đối tượng', condition: 'Thuộc tính được xác minh độc lập tại Ve.', enforcedAt: ['GrantService.decide · tenant từ Directory', 'Enclave.checkGrant · ngữ cảnh đối tượng', 'AAD = Encode(tenant, object, version, type)'], assumptions: ['A1', 'A2'] },
  { id: 'I2', title: 'Ứng dụng không tự mở rộng quyền', condition: 'Không nắm khóa ký, policy hoặc token quản trị.', enforcedAt: ['Khóa ký G không xuất được', 'Hsm.assertCaller · chỉ danh tính cổng', 'Vai trò tự khai bị bỏ qua'], assumptions: ['A1', 'A7'] },
  { id: 'I3', title: 'Ngân sách không tăng do replay hoặc đồng thời', condition: 'Kiểm tra và đặt chỗ nguyên tử trên toàn phạm vi.', enforcedAt: ['StateService.checkAndReserve · nonce + bucket trong một bước', 'Không hoàn bucket burst'], assumptions: ['A3'] },
  { id: 'I4', title: 'Thu hồi có hiệu lực theo epoch hiện hành', condition: 'Quản lý cache, phiên và yêu cầu đang xử lý.', enforcedAt: ['KeyGate · Eok so epoch grant với R', 'Grant TTL 60 giây', 'Kiểm lại quyền khi phát hành lời mời'], assumptions: ['A3', 'A9'] },
  { id: 'I5', title: 'AI không thay cơ chế cấp quyền', condition: 'Bộ thực thi và quyền công cụ độc lập với nội dung mô hình.', enforcedAt: ['checkExecution · allowlist, phạm vi, TTL, hoàn tác', 'AI không giữ khóa, không mở cổng nguồn, không mở lại dịch vụ'], assumptions: ['A4'] },
  { id: 'I6', title: 'Quyền vận hành không phá bản phục hồi được giữ', condition: 'Miền quản trị và vật liệu phục hồi đáp ứng giả thiết.', enforcedAt: ['RecoveryVault.requestDelete · khóa lưu giữ + 2 người duyệt', 'KEK cũ chuyển chỉ-giải-mã, không hủy'], assumptions: ['A4'] },
  { id: 'I7', title: 'DEK và bản rõ xử lý giữ trong ranh giới đã chỉ định', condition: 'Không trả DEK cho host, proxy hoặc plugin ngoài vùng.', enforcedAt: ['Hsm chỉ trả bản bọc KEK / bọc cho khóa nhận', 'Enclave unwrap DEK không xuất được', 'Đầu ra niêm phong cho đích đã xác minh'], assumptions: ['A2', 'A5', 'A7', 'A8'] },
  { id: 'I8', title: 'Khóa nhận DEK gắn với môi trường và phiên được chấp nhận', condition: 'Xác minh chứng thực, tính mới và ngữ cảnh grant.', enforcedAt: ['Verifier.verify · chữ ký gốc, measurement, TCB, debug, thử thách', 'KeyGate · Aok so thumbprint khóa phiên với grant'], assumptions: ['A6'] },
  { id: 'I9', title: 'Restart và rollback không khôi phục quyền đã tiêu thụ', condition: 'Epoch và hạn mức có trạng thái bền vững tại R.', enforcedAt: ['StateService.restoreSnapshot · epoch=max, nonce=hợp, ngân sách=min', 'highWater bền vững'], assumptions: ['A3', 'A9'] },
  { id: 'I10', title: 'Phục hồi áp dụng quyền hiện hành và có thẩm quyền riêng', condition: 'Không hạ epoch, mở quyền cũ hoặc bỏ qua cấp khóa.', enforcedAt: ['RecoveryVault.approveAndRestore · ACL hiện hành, epoch không hạ', 'Bước 2 chứng thực lại môi trường mới'], assumptions: ['A4', 'A9'] },
  { id: 'I11', title: 'Nghiệp vụ hợp lệ hoàn thành khi điều kiện tiến triển được giữ', condition: 'A10, tập W không rỗng và cấu hình đáp ứng năng lực.', enforcedAt: ['Đọc/ghi hợp lệ hoàn thành trong ngân sách', 'Từ chối khi không đủ căn cứ (đánh đổi sẵn sàng được công bố)'], assumptions: ['A10'] },
];

export const ASSUMPTIONS: { id: string; text: string }[] = [
  { id: 'A1', text: 'Đối phương điều khiển A và host ngoài vùng (T3/T5); G, Ve, trình xác minh, K/HSM và R thực thi đúng đặc tả trong TCB đã công bố.' },
  { id: 'A2', text: 'Mọi đường phát hành dữ liệu được bảo vệ đi qua Ve; grant có chữ ký, ràng buộc chủ thể, tenant, đối tượng, thao tác, đích nhận, thời hạn và epoch.' },
  { id: 'A3', text: 'Hạn mức và chống dùng lại cập nhật nguyên tử toàn cục; B, r, Q, L_rem, D_rem, T cùng đơn vị; Q hữu hạn.' },
  { id: 'A4', text: 'Nền RNG và thuật toán đáp ứng giả định; nguồn hóa lý chỉ qua cổng phê duyệt; quyền phục hồi và gốc cấp quyền tách biệt; AI không sửa các gốc.' },
  { id: 'A5', text: 'Cơ chế cách ly enclave, firmware, HSM và chuỗi chứng thực đáp ứng mô hình an ninh nền tảng; kênh bên giới hạn theo hồ sơ.' },
  { id: 'A6', text: 'Bằng chứng gắn đúng khóa phiên với môi trường nhận; host không thay khóa nhận hoặc tái dùng bằng chứng cũ.' },
  { id: 'A7', text: 'HSM/KMS và cổng cấp khóa không trả DEK bản rõ ra ngoài ranh giới; quyền sửa key policy, allowlist, gốc xác minh không thuộc A.' },
  { id: 'A8', text: 'Dữ liệu qua host ở dạng bản mã; kênh vào kết thúc trong vùng; đầu ra chỉ tới đích đã xác minh.' },
  { id: 'A9', text: 'Epoch, chống dùng lại, hạn mức và lượng đặt chỗ bền vững tại R; restart/clone/snapshot không hạ epoch hay hoàn ngân sách.' },
  { id: 'A10', text: 'Khi xét tiến triển: phụ thuộc cần thiết sẵn sàng, thông điệp hợp lệ được xử lý công bằng, yêu cầu trong năng lực.' },
];

export const PROPOSITIONS = [
  { id: 'K1', title: 'Phạm vi phát hành bản rõ', text: 'Dưới A1–A2, mọi sự kiện phát hành bản rõ mới tại Ve nằm trong phạm vi grant hợp lệ do G cấp.', limit: 'Không thu hồi đầu ra đã được phát hành.' },
  { id: 'K2', title: 'Lượng dữ liệu phát hành mới', text: 'Bổ sung A3: E_new(T) ≤ min(D_rem, Q + min(L_rem, B + rT)).', limit: 'Không bao phủ đường đi vòng hoặc bản rõ đã ở ngoài biên.' },
  { id: 'K3', title: 'Ranh giới HSM–enclave', text: 'Dưới A1–A9, quan sát bộ nhớ/kho/đường truyền của host ngoài vùng không tạo quyền đọc DEK hay bản rõ trong Ve ngoài đầu ra được phép.', limit: 'Không bao phủ T7 hoặc tính sẵn sàng khi host gây dừng.' },
];

export const THREATS = [
  { id: 'T1', title: 'Tấn công từ Internet', text: 'KMS/DB không công khai; API kiểm quyền, đầu vào, phiên và giới hạn tài nguyên.' },
  { id: 'T2', title: 'Lộ tài khoản thường', text: 'Không đọc chéo tenant; không tự cấp vai trò; xuất nhạy cảm cần xác minh bổ sung.' },
  { id: 'T3', title: 'Chiếm ứng dụng', text: 'A không giữ KEK, khóa ký grant hay quyền sửa policy; Ve chỉ phát hành đầu ra được phép.' },
  { id: 'T4', title: 'Chiếm tài khoản vận hành', text: 'Không xóa được bản lưu giữ độc lập; thao tác nhạy cảm tách người duyệt.' },
  { id: 'T5', title: 'Kiểm soát host ngoài enclave', text: 'DEK chuyển dưới dạng chỉ vùng nhận đã chứng thực mở được; host vẫn có thể gây gián đoạn.' },
  { id: 'T6', title: 'Chiếm thiết bị khách', text: 'Phân quyền và thu hồi giới hạn hậu quả; endpoint bị chiếm có thể chụp bản rõ đã hiển thị.' },
  { id: 'T7', title: 'Phá thành phần gốc', text: 'HSM, mã Ve, cơ chế cách ly hoặc gốc quản trị bị chiếm: bảo đảm dựa trên thành phần đó không còn hiệu lực.' },
];

export const TRACEABILITY = [
  { claim: 'Nguồn có cận k', basis: 'Mô hình X, E và đường thu.', limit: 'Không suy từ dung lượng hoặc vẻ hỗn loạn.' },
  { claim: 'Đầu ra gần đều', basis: 'Cận k, họ trích xuất và seed.', limit: 'Không áp dụng cho mọi hash hoặc seed tùy ý.' },
  { claim: 'K1 · Phạm vi phát hành', basis: 'A1–A2; G và Ve đúng đặc tả.', limit: 'Không thu hồi đầu ra đã được phát hành.' },
  { claim: 'K2 · Cận dữ liệu mới', basis: 'A3; hạn mức toàn cục và Q hữu hạn.', limit: 'Không bao phủ đường đi vòng hoặc bản rõ đã ở ngoài biên.' },
  { claim: 'K3 · Ranh giới HSM–enclave', basis: 'A1–A9; giữ TCB, cấp khóa và nhập xuất.', limit: 'Không bao phủ T7 hoặc tính sẵn sàng trước host gây dừng.' },
  { claim: 'I8 · Gắn người nhận', basis: 'A6; chứng thực và khóa phiên.', limit: 'Một bằng chứng hợp lệ không tự cấp quyền dữ liệu.' },
  { claim: 'I9 · Chống lùi', basis: 'A3, A9; R còn đáng tin.', limit: 'Snapshot cũ không là nguồn quyền hiện hành.' },
  { claim: 'I10 · Phục hồi', basis: 'A4, A9; quyền riêng và manifest.', limit: 'Bản dữ liệu đủ byte không tự đủ khóa hoặc quyền.' },
  { claim: 'I11 · Tiến triển', basis: 'A10; nghiệp vụ W hợp lệ.', limit: 'Không hứa dịch vụ chạy khi máy hoặc mạng bị dừng.' },
  { claim: 'Bằng chứng có thể đối chiếu', basis: 'Nguồn, thời gian và chuỗi quản lý.', limit: 'Không tự chứng minh danh tính từ IP.' },
  { claim: 'AI có quyền giới hạn', basis: 'Bộ thực thi và schema độc lập.', limit: 'Không loại bỏ lỗi ở bộ thực thi hoặc nguồn log.' },
];

export const CONFIG_PROFILE = [
  { group: 'HSM và KEK', fields: 'Mô-đun, firmware, phạm vi chứng nhận, loại khóa, quyền dùng và cơ chế phục hồi.', links: 'A5, A7; I2, I7, I10' },
  { group: 'Enclave và TCB', fields: 'Nền tảng, mã xử lý, thành phần phải tin cậy, mức vá, debug và chính sách thu hồi.', links: 'A1, A5; I7, I8' },
  { group: 'Chứng thực', fields: 'Gốc tin cậy, giá trị tham chiếu, tính mới, khóa nhận và định danh phiên.', links: 'A6; I8' },
  { group: 'Cấp khóa', fields: 'Grant, principal, key policy, người nhận, ngữ cảnh, trạng thái và mọi đường tương đương.', links: 'A2, A7; I1, I2, I7' },
  { group: 'Nhập xuất', fields: 'Kênh vào, điểm kết thúc mã hóa, mã client, đích nhận và chính sách công bố.', links: 'A8; I1, I7' },
  { group: 'Trạng thái', fields: 'Epoch, mã chống dùng lại, ngân sách, lượng đặt chỗ và tính nguyên tử toàn cục.', links: 'A3, A9; I3, I4, I9' },
  { group: 'Phục hồi', fields: 'Manifest, phiên bản dữ liệu và khóa, quyền phục hồi, gốc mới và chính sách hiện hành.', links: 'A4, A9; I6, I10' },
  { group: 'Tiến triển', fields: 'Tập nghiệp vụ W, phụ thuộc sẵn sàng, công bằng xử lý và giới hạn năng lực.', links: 'A10; I11' },
];
