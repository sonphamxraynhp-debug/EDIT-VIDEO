"""Build assets/broll/catalog.json: thousands of ready-made procedural b-roll presets (topic × template × palette).

usage: python gen_broll_catalog.py [out.json]
Each entry: {id, topic, template, pal, text, sub?, icon?, num?, unit?, items?, seed, tags[]}.
Render any entry: node scripts/broll.mjs render <id> out.mp4 · search: node scripts/broll.mjs search "câu nói".
Add a topic = add one line to TOPICS; templates come from its groups.
"""
import json
import os
import sys
import unicodedata
import zlib

PALS = ["ember", "neon", "ocean", "forest", "gold", "violet", "mono", "sunset", "light", "candy"]

GROUPS = {
    "number": ["bar_chart", "line_chart", "counter_big", "pie", "kpi"],
    "money": ["money_rain", "counter_big", "bar_chart", "kpi", "line_chart"],
    "list": ["checklist", "progress", "timeline_steps"],
    "tech": ["code_rain", "neural", "glitch_text", "browser", "search", "matrix", "orbit_icons"],
    "social": ["likes", "phone_feed", "notifications", "chat"],
    "time": ["clock", "calendar", "countdown", "timeline_steps"],
    "emotion": ["icon_hero", "emoji_burst", "sunburst", "quote_card", "typewriter", "rings"],
    "place": ["globe", "map_pins"],
    "compare": ["versus", "bar_chart"],
    "launch": ["rocket", "countdown", "starfield", "emoji_burst"],
    "news": ["ticker", "glitch_text", "notifications"],
    "music": ["equalizer", "wave_lines", "particles"],
    "idea": ["icon_hero", "rings", "spotlight", "typewriter"],
    "files": ["files", "browser", "checklist"],
    "abstract": ["particles", "blobs", "wave_lines", "hex_grid", "grid_tunnel", "starfield", "sunburst"],
    # v5: life / commerce templates
    "food": ["food_steam", "icon_hero", "star_rating", "price_tag", "emoji_burst"],
    "travel": ["plane_route", "globe", "map_pins", "icon_hero", "calendar"],
    "health": ["heartbeat", "gauge", "checklist", "icon_hero", "progress"],
    "beauty": ["icon_hero", "star_rating", "versus", "sunburst", "checklist"],
    "home": ["house_build", "icon_hero", "price_tag", "checklist", "counter_big"],
    "shop": ["shopping_cart", "price_tag", "gift_box", "star_rating", "notifications"],
    "rating": ["star_rating", "trophy", "quote_card", "gauge"],
    "gift": ["gift_box", "emoji_burst", "sunburst", "icon_hero"],
    "learn": ["book_open", "checklist", "timeline_steps", "icon_hero", "trophy"],
    "meter": ["gauge", "progress", "counter_big", "pie"],
    "win": ["trophy", "emoji_burst", "rings", "sunburst"],
    "service": ["icon_hero", "checklist", "calendar", "star_rating", "chat"],
}

# slug | tags (VN, comma) | on-screen text | icon | groups | extras
T = [
    # ---- kinh doanh / bán hàng
    ("doanh-thu", "doanh thu,tăng doanh thu,bán hàng,revenue,thu nhập", "DOANH THU", "💰", "number,money", {"num": 248, "sub": "so với tháng trước"}),
    ("loi-nhuan", "lợi nhuận,lãi,profit,biên lợi nhuận", "LỢI NHUẬN", "📈", "number,money", {"num": 135}),
    ("don-hang", "đơn hàng,chốt đơn,order,khách đặt hàng", "ĐƠN HÀNG MỚI", "🛒", "social,number", {"num": 1250, "items": ["Đơn hàng mới · 1.250.000đ", "Đơn hàng mới · 890.000đ", "Khách vừa thanh toán", "Đơn hàng mới · 2.100.000đ"]}),
    ("khach-hang", "khách hàng,customer,người mua,tệp khách", "KHÁCH HÀNG", "🤝", "number,social", {"num": 3480, "chat": ["Shop ơi còn hàng không ạ?", "Dạ còn ạ, em gửi mẫu nhé 😊", "Chốt 2 cái nha", "Em lên đơn ngay ạ!"]}),
    ("chot-sale", "chốt sale,chốt đơn,closing,tư vấn bán", "CHỐT SALE", "✅", "emotion,number", {"num": 38, "unit": "%"}),
    ("ban-hang-online", "bán hàng online,bán online,shop online,thương mại điện tử,ecommerce", "BÁN ONLINE", "🛍️", "social,number,tech", {}),
    ("livestream", "livestream,live,phát trực tiếp,bán live", "LIVESTREAM", "🔴", "social,number", {"num": 12500}),
    ("khuyen-mai", "khuyến mãi,giảm giá,sale,flash sale,ưu đãi", "GIẢM 50%", "🏷️", "emotion,launch,news", {"num": 50, "unit": "%"}),
    ("gia-ca", "giá,giá cả,chi phí,bảng giá,pricing", "BẢNG GIÁ", "💲", "number,compare", {}),
    ("san-pham", "sản phẩm,product,mặt hàng,ra mắt sản phẩm", "SẢN PHẨM MỚI", "📦", "launch,idea", {}),
    ("thuong-hieu", "thương hiệu,brand,nhận diện,uy tín", "THƯƠNG HIỆU", "⭐", "idea,emotion", {}),
    ("doi-thu", "đối thủ,cạnh tranh,competitor,so sánh", "ĐỐI THỦ", "⚔️", "compare", {"items": ["HỌ", "BẠN"]}),
    ("thi-truong", "thị trường,market,ngành,xu hướng thị trường", "THỊ TRƯỜNG", "🌏", "place,number", {}),
    ("khoi-nghiep", "khởi nghiệp,startup,mở công ty,kinh doanh riêng", "KHỞI NGHIỆP", "🚀", "launch,idea", {}),
    ("doanh-nghiep", "doanh nghiệp,công ty,business,chủ doanh nghiệp", "DOANH NGHIỆP", "🏢", "number,list", {"items": [["Doanh thu", 12, " tỷ"], ["Nhân sự", 85, ""], ["Tăng trưởng", 34, "%"]]}),
    ("chu-shop", "chủ shop,chủ kinh doanh,người bán,tiểu thương", "CHỦ SHOP", "🏪", "social,money", {}),
    ("chuoi-cua-hang", "chuỗi cửa hàng,chi nhánh,mở rộng,nhượng quyền", "MỞ RỘNG CHUỖI", "📍", "place,number", {"items": ["Hà Nội", "Hải Phòng", "Đà Nẵng", "Nha Trang", "TP.HCM"]}),
    ("xuat-khau", "xuất khẩu,quốc tế,toàn cầu,global,nước ngoài", "VƯƠN RA THẾ GIỚI", "🌍", "place", {"items": ["Việt Nam", "Singapore", "Tokyo", "Seoul", "Sydney"]}),
    ("dau-tu", "đầu tư,nhà đầu tư,gọi vốn,investment", "ĐẦU TƯ", "💼", "money,number", {"num": 5, "unit": " tỷ"}),
    ("tai-chinh", "tài chính,quản lý tiền,ngân sách,dòng tiền,cash flow", "DÒNG TIỀN", "💵", "money,number", {}),
    ("tiet-kiem-tien", "tiết kiệm tiền,tiết kiệm chi phí,giảm chi phí,cắt giảm", "TIẾT KIỆM 70%", "🐷", "money,compare", {"num": 70, "unit": "%"}),
    ("luong", "lương,thu nhập,tăng lương,mức lương,salary", "THU NHẬP", "💸", "money,number", {"num": 50, "unit": " triệu"}),
    ("trieu-phu", "triệu phú,giàu,tự do tài chính,thành công tài chính", "TỰ DO TÀI CHÍNH", "🤑", "money,emotion", {"num": 1000000000, "unit": "đ"}),
    ("hop-dong", "hợp đồng,ký kết,đối tác,partnership", "KÝ HỢP ĐỒNG", "✍️", "files,emotion,list", {"items": ["Đàm phán", "Thống nhất điều khoản", "Ký kết", "Triển khai"]}),
    ("bao-cao", "báo cáo,report,số liệu,thống kê,dashboard", "BÁO CÁO", "📊", "number,files", {}),
    ("kpi", "kpi,chỉ số,mục tiêu,okr,đo lường", "KPI", "🎯", "number,list", {"items": [["Doanh thu", 1250, "tr"], ["Khách mới", 340, ""], ["Chuyển đổi", 12, "%"]]}),
    ("quy-trinh", "quy trình,process,các bước,hệ thống,sop", "QUY TRÌNH", "⚙️", "list", {"items": ["Tiếp nhận", "Xử lý", "Kiểm tra", "Bàn giao"]}),
    ("nhan-su", "nhân sự,tuyển dụng,đội ngũ,team,nhân viên", "ĐỘI NGŨ", "👥", "list,social", {"items": ["Tuyển đúng người", "Đào tạo bài bản", "Giao việc rõ", "Thưởng xứng đáng"]}),
    ("lanh-dao", "lãnh đạo,leader,quản lý,ceo,sếp", "LÃNH ĐẠO", "👑", "idea,emotion", {}),
    ("hop", "cuộc họp,meeting,họp hành,thảo luận", "CUỘC HỌP", "🗓️", "time,social", {}),
    # ---- marketing / content
    ("marketing", "marketing,tiếp thị,quảng bá,chiến dịch", "MARKETING", "📣", "number,social,list", {"items": ["Nghiên cứu", "Nội dung", "Phân phối", "Đo lường"], "num": 180}),
    ("quang-cao", "quảng cáo,chạy ads,facebook ads,tiktok ads,ads", "QUẢNG CÁO", "📢", "number,money", {"num": 320, "sub": "ROAS tăng"}),
    ("viral", "viral,lan truyền,triệu view,nổi tiếng,trend", "VIRAL", "🔥", "social,number,launch", {"num": 2400000}),
    ("luot-xem", "lượt xem,view,views,người xem", "TRIỆU VIEW", "👀", "number,social", {"num": 1200000}),
    ("follower", "follower,người theo dõi,fan,subscriber,tăng follow", "FOLLOWERS", "👥", "social,number", {"num": 100000}),
    ("tuong-tac", "tương tác,like,thả tim,engagement,bình luận", "TƯƠNG TÁC", "❤️", "social", {"num": 128000}),
    ("binh-luan", "bình luận,comment,phản hồi,inbox,tin nhắn", "BÌNH LUẬN", "💬", "social", {"chat": ["Hay quá ạ!", "Cảm ơn bạn nha ❤️", "Xin link với ạ", "Gửi bạn rồi nhé!"]}),
    ("content", "content,nội dung,sáng tạo nội dung,creator,làm nội dung", "CONTENT", "✍️", "idea,list,social", {"items": ["Ý tưởng", "Kịch bản", "Quay", "Dựng", "Đăng"]}),
    ("kich-ban", "kịch bản,script,viết kịch bản,ý tưởng video", "KỊCH BẢN", "📝", "files,idea,list", {}),
    ("thumbnail", "thumbnail,ảnh bìa,tiêu đề,hook", "HOOK 3 GIÂY", "🎣", "idea,emotion", {}),
    ("tiktok", "tiktok,video ngắn,short,reels", "VIDEO NGẮN", "🎵", "social,music", {"items": ["Video lên xu hướng 🔥", "+12.000 follow mới", "Bình luận: xin link ạ", "Đã chia sẻ 3.400 lần"]}),
    ("youtube", "youtube,kênh youtube,vlog,video dài", "YOUTUBE", "▶️", "social,number", {"num": 500000}),
    ("facebook", "facebook,fanpage,trang,group", "FANPAGE", "👍", "social,number", {}),
    ("seo", "seo,google,tìm kiếm,top google,từ khoá", "TOP GOOGLE", "🔍", "tech,number", {"text_search": "cách tăng doanh thu online"}),
    ("email", "email,email marketing,bản tin,newsletter", "EMAIL", "📧", "social,files", {}),
    ("khach-hang-tiem-nang", "khách hàng tiềm năng,lead,data khách,phễu", "LEAD", "🧲", "number,list", {"items": ["Tiếp cận", "Quan tâm", "Cân nhắc", "Mua hàng"]}),
    ("pheu-ban-hang", "phễu bán hàng,funnel,chuyển đổi,conversion", "PHỄU BÁN HÀNG", "🔻", "list,number", {"items": ["Nhận biết", "Quan tâm", "Mong muốn", "Hành động"]}),
    ("kol", "kol,koc,influencer,người nổi tiếng,review", "KOL REVIEW", "🌟", "social,emotion", {}),
    ("ca-nhan", "thương hiệu cá nhân,personal brand,xây kênh", "THƯƠNG HIỆU CÁ NHÂN", "🪞", "idea,social", {}),
    # ---- AI / công nghệ
    ("ai", "ai,trí tuệ nhân tạo,artificial intelligence,máy học", "AI", "🤖", "tech,idea", {}),
    ("chatgpt", "chatgpt,claude,chatbot,gpt,trợ lý ai", "TRỢ LÝ AI", "💬", "tech,social", {"chat": ["Viết giúp mình kịch bản video", "Đây là kịch bản 60 giây cho bạn ✨", "Thêm hook mạnh hơn", "Đã cập nhật!"]}),
    ("tu-dong-hoa", "tự động hoá,automation,tự động,workflow,không cần làm tay", "TỰ ĐỘNG 100%", "⚙️", "tech,list", {"items": ["Nhận yêu cầu", "AI xử lý", "Kiểm tra", "Xuất bản"]}),
    ("prompt", "prompt,ra lệnh,câu lệnh,gõ lệnh", "CHỈ CẦN RA LỆNH", "⌨️", "tech", {"text_search": "edit video này giống mẫu"}),
    ("lap-trinh", "lập trình,code,developer,phần mềm,coding", "LẬP TRÌNH", "👨‍💻", "tech", {}),
    ("website", "website,trang web,landing page,web", "WEBSITE", "🌐", "tech,files", {}),
    ("app", "ứng dụng,app,mobile app,điện thoại", "ỨNG DỤNG", "📱", "tech,social", {}),
    ("du-lieu", "dữ liệu,data,big data,phân tích dữ liệu", "DỮ LIỆU", "🧮", "tech,number", {}),
    ("bao-mat", "bảo mật,an toàn,hacker,security,lừa đảo", "BẢO MẬT", "🔒", "tech,news", {}),
    ("cloud", "cloud,đám mây,lưu trữ,server", "CLOUD", "☁️", "tech,files", {}),
    ("robot", "robot,máy móc,nhà máy thông minh", "ROBOT", "🦾", "tech,launch", {}),
    ("cong-nghe-moi", "công nghệ mới,đột phá,tương lai,innovation", "TƯƠNG LAI", "🔮", "tech,launch,idea", {}),
    ("chuyen-doi-so", "chuyển đổi số,số hoá,digital", "CHUYỂN ĐỔI SỐ", "💡", "tech,list", {}),
    ("ai-video", "ai edit video,dựng video bằng ai,video ai,edit tự động", "AI EDIT VIDEO", "🎬", "tech,list,launch", {"items": ["Cắt khoảng lặng", "Phụ đề tự động", "Chèn nhạc nền", "Hiệu ứng chuyển cảnh", "Xuất video"], "chat": ["Anh ơi video này edit bằng gì vậy?", "Bằng AI 100% luôn em 😎", "Thật á? Mất bao lâu ạ?", "Có 10 phút thôi!"]}),
    ("ai-anh", "ai tạo ảnh,thiết kế ai,midjourney,tạo hình", "AI TẠO ẢNH", "🎨", "tech,idea", {}),
    ("ai-giong-noi", "giọng nói ai,lồng tiếng,voice,text to speech", "GIỌNG NÓI AI", "🎙️", "tech,music", {}),
    # ---- video / sản xuất
    ("edit-video", "edit video,dựng video,hậu kỳ,cắt ghép,premiere,capcut", "EDIT VIDEO", "🎞️", "list,tech", {"items": ["Cắt", "Phụ đề", "Nhạc", "Hiệu ứng", "Xuất"]}),
    ("quay-phim", "quay phim,quay video,camera,máy quay", "QUAY VIDEO", "🎥", "list,idea", {}),
    ("phu-de", "phụ đề,sub,caption,chữ chạy", "PHỤ ĐỀ TỰ ĐỘNG", "💬", "tech,list", {}),
    ("am-nhac", "âm nhạc,nhạc nền,bài hát,giai điệu,music", "NHẠC NỀN", "🎶", "music", {}),
    ("hieu-ung", "hiệu ứng,effect,chuyển cảnh,motion", "HIỆU ỨNG", "✨", "emotion,abstract", {}),
    ("podcast", "podcast,talkshow,trò chuyện,phỏng vấn", "PODCAST", "🎧", "music,social", {}),
    # ---- thời gian / năng suất
    ("thoi-gian", "thời gian,mất thời gian,tốn thời gian,hàng giờ", "THỜI GIAN", "⏰", "time", {"num": 8}),
    ("deadline", "deadline,hạn chót,gấp,áp lực", "DEADLINE", "⏳", "time,news", {}),
    ("tiet-kiem-thoi-gian", "tiết kiệm thời gian,nhanh hơn,chỉ còn vài phút,tốc độ", "NHANH GẤP 10 LẦN", "⚡", "time,compare,launch", {"items": ["4 TIẾNG", "10 PHÚT"]}),
    ("nang-suat", "năng suất,hiệu suất,làm việc hiệu quả,productivity", "NĂNG SUẤT x3", "🚀", "number,list", {"num": 300, "unit": "%"}),
    ("ke-hoach", "kế hoạch,lịch trình,lên kế hoạch,plan,lộ trình", "KẾ HOẠCH", "🗓️", "time,list", {"items": ["Mục tiêu", "Chia nhỏ", "Lịch tuần", "Review"]}),
    ("thoi-quen", "thói quen,mỗi ngày,kỷ luật,habit,routine", "MỖI NGÀY", "📅", "time,list", {"items": ["Dậy sớm", "Đọc sách", "Tập thể dục", "Lên kế hoạch"]}),
    ("30-ngay", "30 ngày,thử thách,challenge,1 tháng", "THỬ THÁCH 30 NGÀY", "🔥", "time,launch", {"num": 1}),
    ("lam-viec", "làm việc,công việc,văn phòng,work", "CÔNG VIỆC", "💼", "list,files", {}),
    ("tap-trung", "tập trung,focus,sâu,không xao nhãng", "TẬP TRUNG", "🎯", "idea,abstract", {}),
    # ---- giáo dục / kiến thức
    ("hoc-tap", "học tập,học,kiến thức,khoá học,course", "HỌC TẬP", "📚", "list,idea", {"items": ["Học", "Thực hành", "Sai", "Sửa", "Thành thạo"]}),
    ("khoa-hoc", "khoá học,đào tạo,lớp học,training,học viên", "KHOÁ HỌC", "🎓", "list,number", {"num": 5000, "sub": "học viên"}),
    ("bi-quyet", "bí quyết,mẹo,tips,cách làm,hướng dẫn", "BÍ QUYẾT", "💡", "idea,list", {"items": ["Bước 1: Chuẩn bị", "Bước 2: Làm thử", "Bước 3: Tối ưu", "Bước 4: Nhân bản"]}),
    ("sai-lam", "sai lầm,lỗi,sai,thất bại,đừng làm", "SAI LẦM", "❌", "emotion,compare", {"items": ["SAI", "ĐÚNG"]}),
    ("bi-mat", "bí mật,ít ai biết,sự thật,hé lộ", "SỰ THẬT", "🤫", "idea,news", {}),
    ("cau-hoi", "câu hỏi,hoài nghi,liệu,có thật không,tại sao", "LIỆU CÓ THẬT?", "❓", "idea,emotion", {"chat": ["Cái này có thật không vậy?", "Thật 100%, xem nè 👇", "Wow, phải thử ngay!", "Làm theo video nhé"]}),
    ("tri-thuc", "sách,đọc sách,tri thức,trí tuệ", "ĐỌC SÁCH", "📖", "idea,list", {}),
    ("ngoai-ngu", "tiếng anh,ngoại ngữ,english,học tiếng", "TIẾNG ANH", "🗣️", "list,social", {}),
    ("tre-em", "trẻ em,con cái,bé,giáo dục con", "TRẺ EM", "🧒", "emotion,list", {}),
    # ---- sức khoẻ / đời sống
    ("suc-khoe", "sức khoẻ,khoẻ mạnh,health,miễn dịch", "SỨC KHOẺ", "💪", "list,number", {"items": ["Ngủ đủ 8 tiếng", "Uống đủ nước", "Vận động 30 phút", "Ăn nhiều rau"]}),
    ("gym", "gym,tập luyện,thể hình,giảm cân,cơ bắp", "TẬP GYM", "🏋️", "number,list,time", {"num": 12, "unit": "kg"}),
    ("an-uong", "ăn uống,dinh dưỡng,thực phẩm,eat clean", "DINH DƯỠNG", "🥗", "list,number", {"items": ["Đạm", "Tinh bột tốt", "Chất béo tốt", "Rau xanh"]}),
    ("giac-ngu", "giấc ngủ,ngủ,mất ngủ,nghỉ ngơi", "GIẤC NGỦ", "😴", "time,emotion", {}),
    ("thien", "thiền,bình an,chữa lành,mindfulness", "BÌNH AN", "🧘", "emotion,abstract", {}),
    ("lam-dep", "làm đẹp,mỹ phẩm,skincare,da đẹp,spa", "DA ĐẸP", "✨", "emotion,compare", {"items": ["TRƯỚC", "SAU"]}),
    ("thoi-trang", "thời trang,quần áo,phong cách,outfit", "PHONG CÁCH", "👗", "emotion,social", {}),
    ("am-thuc", "ẩm thực,món ăn,nhà hàng,quán ăn,nấu ăn", "ẨM THỰC", "🍜", "emotion,social", {}),
    ("ca-phe", "cà phê,coffee,quán cà phê", "CÀ PHÊ", "☕", "emotion,abstract", {}),
    ("du-lich", "du lịch,travel,khám phá,chuyến đi", "DU LỊCH", "✈️", "place,launch", {"items": ["Hà Giang", "Hội An", "Đà Lạt", "Phú Quốc", "Bangkok"]}),
    ("gia-dinh", "gia đình,bố mẹ,vợ chồng,người thân", "GIA ĐÌNH", "👨‍👩‍👧", "emotion", {}),
    ("tinh-yeu", "tình yêu,yêu,người yêu,hẹn hò", "TÌNH YÊU", "💕", "emotion,social", {}),
    ("nha-dat", "bất động sản,nhà đất,căn hộ,mua nhà", "BẤT ĐỘNG SẢN", "🏠", "number,place,money", {}),
    ("o-to", "ô tô,xe hơi,xe,car", "Ô TÔ", "🚗", "launch,number", {}),
    ("the-thao", "thể thao,bóng đá,chạy bộ,marathon", "THỂ THAO", "⚽", "launch,emotion", {}),
    ("game", "game,chơi game,esports,gaming", "GAMING", "🎮", "tech,launch", {}),
    ("pet", "thú cưng,chó,mèo,pet", "THÚ CƯNG", "🐶", "emotion,social", {}),
    ("moi-truong", "môi trường,xanh,thiên nhiên,bền vững", "SỐNG XANH", "🌱", "emotion,place", {}),
    ("tet", "tết,năm mới,lì xì,xuân", "TẾT", "🧧", "emotion,launch,time", {}),
    ("su-kien", "sự kiện,event,hội thảo,workshop", "SỰ KIỆN", "🎤", "time,launch,social", {}),
    ("le-hoi", "lễ hội,tiệc,party,ăn mừng,chúc mừng", "ĂN MỪNG", "🎉", "emotion,launch", {}),
    # ---- cảm xúc / động lực / tư duy
    ("thanh-cong", "thành công,chiến thắng,đạt được,kết quả", "THÀNH CÔNG", "🏆", "emotion,number,launch", {}),
    ("that-bai", "thất bại,vấp ngã,khó khăn,đau khổ", "THẤT BẠI", "💔", "emotion,compare", {}),
    ("dong-luc", "động lực,cảm hứng,truyền cảm hứng,motivation", "ĐỪNG BỎ CUỘC", "🔥", "emotion,idea", {}),
    ("noi-so", "nỗi sợ,sợ hãi,lo lắng,áp lực", "NỖI SỢ", "😨", "emotion,news", {}),
    ("vui-ve", "vui,hạnh phúc,vui vẻ,happy,cười", "VUI!", "😄", "emotion,music", {}),
    ("buon", "buồn,cô đơn,tâm trạng,nhớ", "buồn…", "🥀", "emotion,abstract", {}),
    ("bat-ngo", "bất ngờ,wow,không thể tin,sốc", "WOW!", "🤯", "emotion,news,launch", {}),
    ("tu-duy", "tư duy,mindset,suy nghĩ,góc nhìn", "TƯ DUY", "🧠", "idea,tech", {}),
    ("y-tuong", "ý tưởng,sáng tạo,idea,nảy ra", "Ý TƯỞNG", "💡", "idea", {}),
    ("muc-tieu", "mục tiêu,đích đến,tầm nhìn,goal", "MỤC TIÊU", "🎯", "idea,number,list", {"items": ["Cụ thể", "Đo được", "Khả thi", "Có hạn chót"]}),
    ("lua-chon", "lựa chọn,quyết định,cân nhắc,phân vân", "LỰA CHỌN", "🤔", "compare,idea", {"items": ["CÁCH CŨ", "CÁCH MỚI"]}),
    ("truoc-sau", "trước và sau,trước sau,thay đổi,biến đổi,transformation", "TRƯỚC / SAU", "🔁", "compare", {"items": ["TRƯỚC", "SAU"]}),
    ("bang-chung", "bằng chứng,chứng minh,kết quả thật,feedback,review", "KẾT QUẢ THẬT", "📸", "social,number", {"items": ["Đã nhận hàng, rất ưng ❤️", "Shop tư vấn nhiệt tình", "Sẽ ủng hộ tiếp ạ", "5 sao!"], "chat": ["Nhận hàng rồi, đẹp quá!", "Cảm ơn chị đã tin tưởng ❤️", "Lần sau mua tiếp nha", "Dạ shop luôn sẵn sàng ạ"]}),
    ("cam-on", "cảm ơn,biết ơn,tri ân", "CẢM ƠN", "🙏", "emotion", {}),
    ("dang-ky", "đăng ký,subscribe,theo dõi kênh,follow", "ĐĂNG KÝ NGAY", "🔔", "social,launch", {}),
    ("link", "link,bio,inbox,liên hệ,nhắn tin", "LINK Ở BIO", "👇", "social,emotion", {}),
    ("canh-bao", "cảnh báo,chú ý,lưu ý,warning,nguy hiểm", "CẢNH BÁO", "⚠️", "news,emotion", {}),
    ("tin-tuc", "tin tức,tin nóng,mới nhất,breaking,cập nhật", "TIN NÓNG", "📰", "news", {"items": ["TIN NÓNG", "MỚI NHẤT", "CẬP NHẬT", "ĐỘC QUYỀN"]}),
    ("top", "top,xếp hạng,số 1,hàng đầu,tốt nhất", "TOP 1", "🥇", "number,emotion", {}),
    ("mien-phi", "miễn phí,free,tặng,quà tặng", "MIỄN PHÍ", "🎁", "emotion,launch", {}),
    ("100-phan-tram", "100%,hoàn toàn,tuyệt đối,trọn vẹn", "100%", "💯", "number,emotion", {"num": 100, "unit": "%"}),
    ("de-dang", "dễ dàng,đơn giản,ai cũng làm được,chỉ cần", "SIÊU ĐƠN GIẢN", "👌", "list,emotion", {"items": ["Mở máy", "Ra lệnh", "Nhận kết quả"]}),
    ("cong-dong", "cộng đồng,group,thành viên,hội nhóm", "CỘNG ĐỒNG", "🫂", "social,number,place", {"num": 50000}),
    ("ket-noi", "kết nối,mạng lưới,network,quan hệ", "KẾT NỐI", "🔗", "tech,place", {}),
    ("phat-trien", "phát triển,tăng trưởng,growth,bứt phá,scale", "BỨT PHÁ", "📈", "number,launch", {"num": 500}),
    ("hanh-trinh", "hành trình,câu chuyện,quá trình,từ con số 0", "HÀNH TRÌNH", "🧭", "time,list,place", {"items": ["Con số 0", "Thử sai", "Bước ngoặt", "Thành công"]}),
    ("nhieu", "rất nhiều,vô số,đa dạng,sinh động,phong phú", "VÔ SỐ", "🌈", "abstract,emotion", {}),
    ("dem-nguoc", "đếm ngược,sắp ra mắt,chuẩn bị,sẵn sàng", "SẴN SÀNG?", "⏱️", "launch,time", {}),
    ("ket-luan", "kết luận,tóm lại,cuối cùng,chốt lại", "TÓM LẠI", "📌", "list,idea", {"items": ["Hiểu vấn đề", "Chọn công cụ", "Làm ngay hôm nay"]}),
]

T2 = [
    # ---- ẩm thực / quán / F&B
    ("mon-an", "món ăn,đồ ăn,ẩm thực,food,món ngon", "MÓN NGON", "🍲", "food,emotion", {}),
    ("pho", "phở,phở bò,phở gà,bún,mì", "PHỞ NÓNG HỔI", "🍜", "food", {}),
    ("com", "cơm,cơm tấm,cơm văn phòng,cơm nhà", "CƠM NHÀ", "🍚", "food", {}),
    ("banh-mi", "bánh mì,đồ ăn sáng,bữa sáng,breakfast", "BÁNH MÌ", "🥖", "food", {}),
    ("lau-nuong", "lẩu,nướng,bbq,đồ nướng,buffet", "LẨU NƯỚNG", "🍢", "food,social", {}),
    ("tra-sua", "trà sữa,trà,đồ uống,nước ép,sinh tố", "TRÀ SỮA", "🧋", "food,shop", {}),
    ("banh-ngot", "bánh ngọt,bánh kem,tráng miệng,dessert,bánh", "BÁNH NGỌT", "🍰", "food,gift", {}),
    ("hai-san", "hải sản,cua,tôm,cá,ốc", "HẢI SẢN TƯƠI", "🦐", "food", {}),
    ("chay", "đồ chay,ăn chay,thuần chay,healthy food", "ĂN CHAY", "🥗", "food,health", {}),
    ("nau-an", "nấu ăn,công thức,vào bếp,cooking,nấu", "VÀO BẾP", "👩‍🍳", "food,list", {"items": ["Sơ chế", "Ướp gia vị", "Nấu lửa vừa", "Trình bày"]}),
    ("nha-hang", "nhà hàng,quán ăn,quán,restaurant,thực đơn", "NHÀ HÀNG", "🍽️", "food,rating,place", {"num": 4.8}),
    ("giao-do-an", "giao đồ ăn,ship đồ ăn,đặt món,delivery,grabfood", "GIAO TẬN NƠI", "🛵", "food,social,time", {}),
    ("dac-san", "đặc sản,đặc sản vùng miền,quà quê,món địa phương", "ĐẶC SẢN", "🧺", "food,place,gift", {"items": ["Hà Nội", "Huế", "Hội An", "Cần Thơ", "Đà Lạt"]}),
    ("an-vat", "ăn vặt,đồ ăn vặt,snack,bánh tráng", "ĂN VẶT", "🍿", "food,shop", {}),
    ("ruou-bia", "bia,rượu,rượu vang,đồ uống có cồn,cocktail", "CHEERS!", "🍻", "food,emotion", {}),
    ("trai-cay", "trái cây,hoa quả,fruit,vitamin", "TRÁI CÂY TƯƠI", "🍉", "food,health", {}),
    ("menu", "menu,thực đơn,bảng giá món,combo", "COMBO HÔM NAY", "📋", "food,shop,list", {"items": ["Combo 1 người", "Combo gia đình", "Combo tiệc"]}),
    # ---- du lịch
    ("bien", "biển,bãi biển,đi biển,resort,beach", "ĐI BIỂN", "🏖️", "travel,emotion", {"items": ["Hà Nội", "Phú Quốc"]}),
    ("nui", "núi,leo núi,trekking,sa pa,hà giang", "CHINH PHỤC ĐỈNH", "⛰️", "travel,win", {"items": ["Hà Nội", "Hà Giang"]}),
    ("khach-san", "khách sạn,homestay,resort,đặt phòng,lưu trú", "ĐẶT PHÒNG", "🏨", "travel,rating,home", {"num": 4.7}),
    ("ve-may-bay", "vé máy bay,chuyến bay,bay,sân bay,flight", "BAY NGAY", "✈️", "travel,shop,time", {"items": ["TP.HCM", "Đà Nẵng"]}),
    ("du-lich-nuoc-ngoai", "du lịch nước ngoài,nhật bản,hàn quốc,thái lan,châu âu", "XUẤT NGOẠI", "🗾", "travel,place", {"items": ["Hà Nội", "Tokyo"]}),
    ("phuot", "phượt,road trip,đi xe máy,khám phá", "LÊN ĐƯỜNG", "🏍️", "travel,emotion", {"items": ["Hà Nội", "Mộc Châu"]}),
    ("lich-trinh", "lịch trình,kế hoạch du lịch,itinerary,ngày 1", "LỊCH TRÌNH 3 NGÀY", "🗓️", "travel,list,time", {"items": ["Ngày 1: Check-in", "Ngày 2: Khám phá", "Ngày 3: Ẩm thực"]}),
    ("check-in", "check in,sống ảo,điểm chụp ảnh,view đẹp", "CHECK-IN", "📸", "travel,social", {}),
    ("visa", "visa,hộ chiếu,passport,thủ tục xuất cảnh", "VISA DỄ DÀNG", "🛂", "travel,list,files", {"items": ["Hộ chiếu", "Ảnh 4x6", "Sao kê", "Lịch trình"]}),
    ("tour", "tour,tour du lịch,trọn gói,combo du lịch", "TOUR TRỌN GÓI", "🧳", "travel,shop", {}),
    ("cam-trai", "cắm trại,camping,glamping,dã ngoại", "CẮM TRẠI", "🏕️", "travel,emotion", {}),
    # ---- sức khoẻ / y tế
    ("tim-mach", "tim mạch,huyết áp,nhịp tim,tim", "TIM KHOẺ", "❤️", "health", {"num": 72}),
    ("giam-can", "giảm cân,giảm mỡ,eat clean,calo,cân nặng", "GIẢM 5 KG", "⚖️", "health,meter", {"num": 5, "unit": " kg"}),
    ("dinh-duong", "dinh dưỡng,vitamin,protein,thực phẩm chức năng", "DINH DƯỠNG", "🥦", "health,food", {}),
    ("benh-vien", "bệnh viện,bác sĩ,khám bệnh,phòng khám,y tế", "KHÁM ĐỊNH KỲ", "🏥", "health,list", {"items": ["Đo huyết áp", "Xét nghiệm máu", "Siêu âm"]}),
    ("thuoc", "thuốc,dược phẩm,nhà thuốc,kê đơn", "DÙNG THUỐC ĐÚNG", "💊", "health,list", {"items": ["Đúng liều", "Đúng giờ", "Hỏi dược sĩ"]}),
    ("yoga", "yoga,giãn cơ,thở,dẻo dai", "YOGA MỖI NGÀY", "🧘", "health,time", {}),
    ("chay-bo", "chạy bộ,running,marathon,cardio,đi bộ", "CHẠY 5 KM", "🏃", "health,meter,win", {"num": 5, "unit": " km"}),
    ("nuoc", "uống nước,nước lọc,đủ nước,hydrate", "2 LÍT NƯỚC", "💧", "health,meter", {"num": 2, "unit": " lít"}),
    ("tam-ly", "tâm lý,stress,căng thẳng,lo âu,sức khoẻ tinh thần", "BỚT CĂNG THẲNG", "🧠", "health,emotion", {}),
    ("rang-mieng", "răng,nha khoa,niềng răng,răng miệng,nụ cười", "NỤ CƯỜI ĐẸP", "🦷", "health,rating", {}),
    ("mat", "mắt,cận thị,thị lực,kính", "BẢO VỆ MẮT", "👁️", "health,list", {"items": ["20-20-20", "Giảm ánh sáng xanh", "Ngủ đủ"]}),
    ("me-bau", "mẹ bầu,mang thai,em bé,sau sinh", "MẸ VÀ BÉ", "🤰", "health,home", {}),
    # ---- làm đẹp / mỹ phẩm / thời trang
    ("skincare", "skincare,dưỡng da,chăm sóc da,serum,kem dưỡng", "DA ĐẸP MỖI NGÀY", "🧴", "beauty,list", {"items": ["Làm sạch", "Toner", "Serum", "Kem chống nắng"]}),
    ("trang-diem", "trang điểm,makeup,son,phấn,make up", "MAKEUP NHANH", "💄", "beauty,shop", {}),
    ("toc", "tóc,chăm sóc tóc,nhuộm tóc,salon,cắt tóc", "TÓC ĐẸP", "💇", "beauty,rating", {}),
    ("mun", "mụn,trị mụn,thâm,lỗ chân lông", "HẾT MỤN", "✨", "beauty,compare", {"items": ["TRƯỚC", "SAU"]}),
    ("nuoc-hoa", "nước hoa,mùi hương,perfume,body mist", "MÙI HƯƠNG", "🌸", "beauty,gift", {}),
    ("spa", "spa,massage,thư giãn,chăm sóc cơ thể", "SPA THƯ GIÃN", "💆", "beauty,shop", {}),
    ("nail", "nail,làm móng,sơn móng", "NAIL XINH", "💅", "beauty,shop", {}),
    ("phoi-do", "phối đồ,outfit,mặc đẹp,ootd,style", "OUTFIT HÔM NAY", "👗", "beauty,social", {}),
    ("giay-dep", "giày,sneaker,dép,túi xách,phụ kiện", "SNEAKER MỚI", "👟", "shop,rating", {}),
    # ---- nhà cửa / BĐS / nội thất
    ("can-ho", "căn hộ,chung cư,apartment,phòng ngủ", "CĂN HỘ 2PN", "🏢", "home,number", {"num": 65, "unit": " m²"}),
    ("nha-pho", "nhà phố,nhà mặt tiền,shophouse,nhà riêng", "NHÀ PHỐ", "🏠", "home,shop", {}),
    ("dat-nen", "đất nền,lô đất,sổ đỏ,mảnh đất,đất", "ĐẤT NỀN SỔ ĐỎ", "📜", "home,place", {"items": ["Thủ Đức", "Long An", "Bình Dương"]}),
    ("noi-that", "nội thất,thiết kế nội thất,sofa,decor,trang trí", "NỘI THẤT ĐẸP", "🛋️", "home,compare", {"items": ["TRƯỚC", "SAU"]}),
    ("xay-nha", "xây nhà,xây dựng,thi công,sửa nhà,cải tạo", "XÂY NHÀ", "🏗️", "home,list,time", {"items": ["Thiết kế", "Móng", "Phần thô", "Hoàn thiện"]}),
    ("vay-mua-nha", "vay mua nhà,lãi suất,trả góp,ngân hàng,vay vốn", "TRẢ GÓP 0%", "🏦", "home,money,meter", {"num": 70, "unit": "%"}),
    ("thue-nha", "thuê nhà,cho thuê,phòng trọ,thuê phòng", "CHO THUÊ", "🔑", "home,shop", {}),
    ("phong-thuy", "phong thuỷ,hướng nhà,tuổi,hợp mệnh", "PHONG THUỶ", "🧭", "home,idea", {}),
    ("don-dep", "dọn dẹp,dọn nhà,ngăn nắp,vệ sinh,giặt giũ", "NHÀ SẠCH BONG", "🧹", "home,list", {"items": ["Phòng khách", "Bếp", "Phòng tắm"]}),
    ("do-gia-dung", "đồ gia dụng,nồi chiên,máy lọc,đồ bếp,thiết bị nhà bếp", "ĐỒ GIA DỤNG", "🍳", "home,shop", {}),
    ("tiet-kiem-dien", "tiết kiệm điện,hoá đơn điện,năng lượng mặt trời,điện", "TIẾT KIỆM ĐIỆN", "💡", "home,money,meter", {"num": 30, "unit": "%"}),
    # ---- giáo dục / trẻ em / gia đình
    ("thi-cu", "thi cử,ôn thi,đại học,điểm thi,kỳ thi", "ĐỖ ĐẠI HỌC", "🎓", "learn,win,time", {}),
    ("tieng-anh", "tiếng anh,ielts,toeic,giao tiếp tiếng anh,english", "IELTS 7.0", "🇬🇧", "learn,meter", {"num": 7, "unit": ".0"}),
    ("doc-sach", "đọc sách,sách,thói quen đọc,book", "ĐỌC SÁCH", "📖", "learn,time", {}),
    ("ky-nang", "kỹ năng,kỹ năng mềm,giao tiếp,thuyết trình", "KỸ NĂNG MỀM", "🗣️", "learn,list", {"items": ["Lắng nghe", "Đặt câu hỏi", "Phản hồi"]}),
    ("day-con", "dạy con,nuôi dạy con,cha mẹ,giáo dục con", "DẠY CON", "👨‍👩‍👧", "learn,home,emotion", {}),
    ("mam-non", "mầm non,trẻ nhỏ,bé,trẻ mẫu giáo", "BÉ VUI HỌC", "🧸", "learn,gift", {}),
    ("toan", "toán,toán học,tính nhẩm,công thức", "TOÁN DỄ", "➗", "learn,number", {}),
    ("lap-trinh-cho-tre", "lập trình cho trẻ,stem,robotics,khoa học", "STEM", "🔬", "learn,tech", {}),
    ("hoc-online", "học online,khoá học online,e-learning,zoom", "HỌC ONLINE", "💻", "learn,tech", {}),
    ("chung-chi", "chứng chỉ,bằng cấp,tốt nghiệp,certificate", "CHỨNG CHỈ", "📜", "learn,win", {}),
    ("cuoi-hoi", "đám cưới,cưới,cầu hôn,tiệc cưới", "NGÀY CƯỚI", "💍", "gift,emotion", {}),
    ("sinh-nhat", "sinh nhật,tiệc,party,kỷ niệm", "HAPPY BIRTHDAY", "🎂", "gift,emotion", {}),
    ("nguoi-gia", "ông bà,người cao tuổi,cha mẹ già,hiếu thảo", "ÔNG BÀ", "👵", "emotion,health", {}),
    ("ban-be", "bạn bè,tình bạn,hội bạn,bff", "HỘI BẠN THÂN", "🤗", "emotion,social", {}),
    # ---- mua sắm / bán lẻ / thương mại điện tử
    ("gio-hang", "giỏ hàng,thêm vào giỏ,mua sắm,shopping,đặt hàng", "THÊM VÀO GIỎ", "🛒", "shop,number", {"num": 499000}),
    ("freeship", "freeship,miễn phí vận chuyển,giao hàng miễn phí,ship", "FREESHIP", "🚚", "shop,emotion", {}),
    ("voucher", "voucher,mã giảm giá,coupon,code giảm", "VOUCHER 100K", "🎟️", "shop,gift", {}),
    ("san-thuong-mai", "shopee,lazada,tiki,sàn thương mại điện tử,sàn", "LÊN SÀN", "🛍️", "shop,number,social", {"num": 1200}),
    ("dong-goi", "đóng gói,gói hàng,hộp,unbox,mở hộp", "MỞ HỘP", "📦", "shop,gift", {}),
    ("giao-hang", "giao hàng,vận chuyển,shipper,logistics,kho", "GIAO 2H", "🚛", "shop,time,place", {"items": ["Kho Hà Nội", "Kho Đà Nẵng", "Kho TP.HCM"]}),
    ("doi-tra", "đổi trả,bảo hành,hoàn tiền,cam kết", "ĐỔI TRẢ 30 NGÀY", "🔄", "shop,list", {"items": ["Lỗi 1 đổi 1", "Hoàn tiền 100%", "Bảo hành 12 tháng"]}),
    ("hang-chinh-hang", "chính hãng,hàng thật,authentic,xuất xứ", "CHÍNH HÃNG 100%", "✅", "shop,rating", {}),
    ("best-seller", "bán chạy,best seller,cháy hàng,hết hàng,hot", "BÁN CHẠY NHẤT", "🔥", "shop,win,number", {"num": 10000}),
    ("combo", "combo,mua 1 tặng 1,tặng kèm,quà tặng", "MUA 1 TẶNG 1", "🎁", "shop,gift", {}),
    ("dat-truoc", "đặt trước,pre-order,giữ chỗ,đặt cọc", "ĐẶT TRƯỚC", "⏳", "shop,time", {}),
    ("gia-si", "giá sỉ,bán buôn,nhập hàng,đại lý,nguồn hàng", "GIÁ SỈ", "🏷️", "shop,money,list", {"items": ["Từ 10 sp", "Từ 50 sp", "Từ 100 sp"]}),
    ("thanh-toan", "thanh toán,chuyển khoản,quét mã qr,ví điện tử,cod", "THANH TOÁN DỄ", "💳", "shop,tech,list", {"items": ["Chuyển khoản", "Quét QR", "COD"]}),
    # ---- dịch vụ / nghề nghiệp
    ("tu-van", "tư vấn,hỗ trợ,chăm sóc khách hàng,hotline", "TƯ VẤN MIỄN PHÍ", "📞", "service,social", {}),
    ("dat-lich", "đặt lịch,hẹn,booking,lịch hẹn", "ĐẶT LỊCH NGAY", "📅", "service,time", {}),
    ("bao-hiem", "bảo hiểm,bảo hiểm nhân thọ,bảo vệ,quyền lợi", "BẢO VỆ GIA ĐÌNH", "🛡️", "service,money", {}),
    ("luat", "luật,pháp lý,luật sư,hợp đồng,thủ tục", "PHÁP LÝ RÕ RÀNG", "⚖️", "service,files,list", {"items": ["Giấy phép", "Hợp đồng", "Thuế"]}),
    ("ke-toan", "kế toán,thuế,báo cáo thuế,sổ sách", "KẾ TOÁN THUẾ", "🧾", "service,number,files", {}),
    ("sua-chua", "sửa chữa,bảo trì,thợ,kỹ thuật,sửa", "SỬA NHANH", "🔧", "service,time", {}),
    ("van-tai", "vận tải,xe tải,taxi,đặt xe,di chuyển", "ĐẶT XE", "🚕", "service,travel", {"items": ["Điểm đón", "Điểm đến"]}),
    ("tuyen-dung", "tuyển dụng,việc làm,ứng tuyển,hiring,cv", "ĐANG TUYỂN", "🧑‍💼", "service,list", {"items": ["Gửi CV", "Phỏng vấn", "Nhận việc"]}),
    ("freelancer", "freelancer,làm tự do,nghề tay trái,việc online", "LÀM TỰ DO", "🧑‍💻", "money,tech", {}),
    ("nong-nghiep", "nông nghiệp,trồng trọt,nông sản,vườn,canh tác", "NÔNG SẢN SẠCH", "🌾", "food,place", {}),
    ("chan-nuoi", "chăn nuôi,trang trại,gà,heo,bò", "TRANG TRẠI", "🐄", "food,place", {}),
    ("xe-dien", "xe điện,ô tô điện,vinfast,sạc điện", "XE ĐIỆN", "🔋", "tech,meter", {"num": 80, "unit": "%"}),
    ("bao-duong-xe", "bảo dưỡng xe,thay dầu,lốp xe,garage", "BẢO DƯỠNG XE", "🛞", "service,list", {"items": ["Thay dầu", "Kiểm tra phanh", "Áp suất lốp"]}),
    # ---- thể thao / giải trí
    ("bong-da", "bóng đá,football,world cup,trận đấu,ghi bàn", "VÀO!!!", "⚽", "win,emotion,number", {"num": 3}),
    ("cau-long", "cầu lông,pickleball,tennis,bóng bàn", "PICKLEBALL", "🏸", "win,health", {}),
    ("boi-loi", "bơi,bơi lội,hồ bơi,swimming", "BƠI LỘI", "🏊", "health,emotion", {}),
    ("phim", "phim,điện ảnh,rạp chiếu,netflix,series", "PHIM HAY", "🎬", "rating,emotion", {"num": 4.6}),
    ("am-nhac-song", "concert,nhạc sống,ca sĩ,show diễn", "CONCERT", "🎤", "music,emotion", {}),
    ("du-lich-tam-linh", "chùa,đi lễ,tâm linh,cầu an", "CẦU AN", "🙏", "travel,emotion", {"items": ["Hà Nội", "Yên Tử"]}),
    ("thu-cung", "thú cưng,chó,mèo,boss,pet shop", "BOSS ĐÁNG YÊU", "🐶", "emotion,shop", {}),
    # ---- tài chính cá nhân
    ("chung-khoan", "chứng khoán,cổ phiếu,vn-index,đầu tư chứng khoán", "CỔ PHIẾU", "📊", "money,number,meter", {"num": 12, "unit": "%"}),
    ("vang", "vàng,giá vàng,tích trữ,vàng miếng", "GIÁ VÀNG", "🪙", "money,number", {}),
    ("crypto", "crypto,bitcoin,tiền số,blockchain", "BITCOIN", "₿", "money,tech", {}),
    ("quy-du-phong", "quỹ dự phòng,khẩn cấp,để dành,tiết kiệm", "QUỸ DỰ PHÒNG", "🐷", "money,meter", {"num": 6, "unit": " tháng"}),
    ("no", "nợ,vay nợ,thẻ tín dụng,trả nợ,lãi", "THOÁT NỢ", "⛓️", "money,emotion", {}),
    ("thu-nhap-thu-dong", "thu nhập thụ động,passive income,dòng tiền thụ động", "THU NHẬP THỤ ĐỘNG", "💸", "money,number", {}),
    ("chi-tieu", "chi tiêu,ngân sách cá nhân,50/30/20,quản lý chi tiêu", "50 / 30 / 20", "🧮", "money,list", {"items": ["50% thiết yếu", "30% mong muốn", "20% tiết kiệm"]}),
    # ---- doanh nghiệp / vận hành (bổ sung)
    ("van-hoa-cong-ty", "văn hoá công ty,văn hoá doanh nghiệp,giá trị cốt lõi,đội ngũ", "VĂN HOÁ", "🏛️", "learn,emotion,list", {"items": ["Chính trực", "Tận tâm", "Đổi mới"]}),
    ("dao-tao-noi-bo", "đào tạo nội bộ,onboarding,huấn luyện,coaching", "ĐÀO TẠO", "🧑‍🏫", "learn,list", {"items": ["Định hướng", "Thực hành", "Đánh giá"]}),
    ("doi-tac", "đối tác,hợp tác,liên kết,b2b", "ĐỐI TÁC CHIẾN LƯỢC", "🤝", "place,emotion", {"items": ["Hà Nội", "TP.HCM", "Singapore"]}),
    ("giai-thuong", "giải thưởng,vinh danh,top,xếp hạng,danh hiệu", "TOP 10 THƯƠNG HIỆU", "🏆", "win,rating", {"num": 4.9}),
    ("su-hai-long", "hài lòng,đánh giá 5 sao,feedback tốt,khách khen", "99% HÀI LÒNG", "😍", "rating,meter", {"num": 99, "unit": "%"}),
    ("nha-may", "nhà máy,sản xuất,dây chuyền,xưởng,factory", "NHÀ MÁY", "🏭", "number,list", {"items": ["Nguyên liệu", "Sản xuất", "Kiểm định", "Xuất xưởng"]}),
    ("chat-luong", "chất lượng,kiểm định,iso,tiêu chuẩn,qc", "CHUẨN ISO", "🔍", "rating,list", {"items": ["Kiểm định đầu vào", "Kiểm tra từng lô", "Chứng nhận ISO"]}),
    ("ben-vung", "bền vững,xanh,esg,tái chế,môi trường", "SỐNG XANH", "♻️", "meter,emotion", {"num": 100, "unit": "%"}),
    ("ra-mat", "ra mắt,launch,sự kiện ra mắt,mở bán", "CHÍNH THỨC RA MẮT", "🚀", "launch,gift", {}),
    ("khai-truong", "khai trương,mở cửa,grand opening,chi nhánh mới", "KHAI TRƯƠNG", "🎊", "gift,place,emotion", {"items": ["Quận 1", "Quận 7", "Thủ Đức"]}),
    # ---- cảm xúc / mùa / dịp
    ("mua-he", "mùa hè,nắng nóng,hè,summer", "HÈ RỰC RỠ", "☀️", "emotion,travel", {"items": ["Hà Nội", "Nha Trang"]}),
    ("mua-dong", "mùa đông,lạnh,giáng sinh,noel,christmas", "GIÁNG SINH", "🎄", "gift,emotion", {}),
    ("trung-thu", "trung thu,bánh trung thu,đèn lồng,rằm", "TRUNG THU", "🏮", "gift,food", {}),
    ("valentine", "valentine,8/3,20/10,ngày phụ nữ,lễ tình nhân", "YÊU THƯƠNG", "💝", "gift,emotion", {}),
    ("black-friday", "black friday,11/11,12/12,siêu sale,sale lớn", "SIÊU SALE 11.11", "🛍️", "shop,launch,number", {"num": 70, "unit": "%"}),
    ("tu-hao", "tự hào,việt nam,người việt,made in vietnam", "TỰ HÀO VIỆT NAM", "🇻🇳", "win,emotion", {}),
    ("biet-on", "biết ơn,tri ân,cảm ơn khách hàng,tri ân", "TRI ÂN", "🙏", "gift,emotion", {}),
    ("hai-huoc", "hài hước,vui,cười,meme,troll", "HAHA", "😂", "emotion,social", {}),
    ("cam-dong", "cảm động,xúc động,rơi nước mắt,ý nghĩa", "XÚC ĐỘNG", "🥹", "emotion", {}),
    ("phan-no", "bức xúc,tức giận,phẫn nộ,không chấp nhận", "BỨC XÚC", "😤", "emotion,news", {}),
    ("lo-lang", "lo lắng,băn khoăn,phân vân,sợ", "BĂN KHOĂN?", "😟", "emotion,idea", {}),
    ("tu-tin", "tự tin,mạnh mẽ,bản lĩnh,không ngại", "TỰ TIN", "😎", "emotion,win", {}),
    ("kien-nhan", "kiên nhẫn,bền bỉ,từ từ,không bỏ cuộc", "KIÊN TRÌ", "🐢", "time,emotion", {}),
    ("doi-moi", "đổi mới,sáng tạo,khác biệt,innovation", "SÁNG TẠO", "🎨", "idea,launch", {}),
    ("an-toan", "an toàn,bảo vệ,yên tâm,an ninh", "AN TOÀN TUYỆT ĐỐI", "🔒", "service,rating", {}),
    ("nhanh-chong", "nhanh chóng,siêu tốc,tức thì,trong 1 phút", "SIÊU TỐC", "⚡", "time,meter", {"num": 1, "unit": " phút"}),
    ("chat-luong-cao", "cao cấp,premium,sang trọng,đẳng cấp,luxury", "CAO CẤP", "💎", "rating,gift", {}),
    ("gia-re", "giá rẻ,rẻ nhất,bình dân,hạt dẻ,tiết kiệm", "GIÁ HẠT DẺ", "💰", "shop,money", {"num": 99000}),
    ("uy-tin", "uy tín,tin cậy,lâu năm,đáng tin", "UY TÍN 10 NĂM", "🏅", "rating,win", {"num": 4.9}),
    ("so-sanh-gia", "so sánh giá,rẻ hơn,đắt hơn,chênh lệch", "RẺ HƠN 30%", "⚖️", "compare,shop", {"items": ["CHỖ KHÁC", "Ở ĐÂY"]}),
    ("bi-kip", "bí kíp,mẹo,tips,hack,mẹo vặt", "MẸO HAY", "💡", "idea,list", {"items": ["Mẹo 1", "Mẹo 2", "Mẹo 3"]}),
    ("review-that", "review thật,trải nghiệm thật,dùng thử,test thử", "REVIEW THẬT", "🧪", "rating,compare", {"num": 4.5}),
]

MORE = [
    ("cafe-sang", "cà phê sáng,coffee,quán cà phê,barista,latte", "CÀ PHÊ SÁNG", "☕", "food,time", {}),
    ("bep-gia-dinh", "bữa cơm gia đình,bếp nhà,mâm cơm,sum họp", "BỮA CƠM NHÀ", "🍱", "food,emotion", {}),
    ("an-sach", "thực phẩm sạch,organic,hữu cơ,rau sạch", "SẠCH 100%", "🥬", "food,health,meter", {"num": 100, "unit": "%"}),
    ("dau-bep", "đầu bếp,chef,công thức bí truyền,món tủ", "CHEF GỢI Ý", "👨‍🍳", "food,rating", {"num": 4.9}),
    ("dao-dao", "đảo,biển đảo,lặn biển,san hô", "THIÊN ĐƯỜNG ĐẢO", "🏝️", "travel,emotion", {"items": ["Nha Trang", "Côn Đảo"]}),
    ("san-may", "săn mây,bình minh,hoàng hôn,cảnh đẹp", "SĂN MÂY", "🌄", "travel,emotion", {"items": ["Hà Nội", "Tà Xùa"]}),
    ("phuc-hoi", "phục hồi,hồi phục,chấn thương,vật lý trị liệu", "PHỤC HỒI", "🩹", "health,time", {}),
    ("ngu-ngon", "ngủ ngon,mất ngủ,giấc ngủ sâu,8 tiếng", "NGỦ ĐỦ 8 TIẾNG", "😴", "health,meter", {"num": 90, "unit": "%"}),
    ("chong-nang", "kem chống nắng,chống nắng,tia uv,spf", "CHỐNG NẮNG", "🌞", "beauty,meter", {"num": 50, "unit": "%"}),
    ("cham-soc-nam", "chăm sóc da nam,nam giới,râu,men care", "MEN CARE", "🧔", "beauty,shop", {}),
    ("view-dep", "view đẹp,view sông,view biển,tầm nhìn", "VIEW TRIỆU ĐÔ", "🌇", "home,emotion", {}),
    ("ban-giao", "bàn giao,nhận nhà,chìa khoá,hoàn thiện", "NHẬN NHÀ", "🗝️", "home,win,time", {}),
    ("tien-ich", "tiện ích,hồ bơi,gym,công viên,nội khu", "TIỆN ÍCH 5 SAO", "🏊", "home,rating,list", {"items": ["Hồ bơi", "Gym", "Công viên", "Trường học"]}),
    ("hoc-bong", "học bổng,du học,scholarship,du học sinh", "HỌC BỔNG 100%", "🎓", "learn,win,meter", {"num": 100, "unit": "%"}),
    ("on-tap", "ôn tập,ghi nhớ,flashcard,học thuộc", "NHỚ LÂU", "🧠", "learn,list", {"items": ["Đọc", "Tóm tắt", "Ôn lại sau 1 ngày"]}),
    ("phu-huynh", "phụ huynh,họp phụ huynh,con đi học,bố mẹ", "PHỤ HUYNH", "👪", "learn,emotion", {}),
    ("flash-sale", "flash sale,giờ vàng,săn sale,chớp nhoáng", "FLASH SALE", "⚡", "shop,launch,time", {}),
    ("qua-tang", "quà tặng,quà biếu,hộp quà,gift set", "QUÀ Ý NGHĨA", "🎀", "gift,shop", {}),
    ("khach-quen", "khách quen,khách hàng thân thiết,tích điểm,thành viên", "KHÁCH THÂN THIẾT", "💳", "shop,rating,number", {"num": 5000}),
    ("dich-vu-tai-nha", "dịch vụ tại nhà,tận nơi,đến tận nhà,onsite", "TẬN NHÀ", "🏡", "service,travel", {"items": ["Cửa hàng", "Nhà bạn"]}),
    ("bao-hanh", "bảo hành,bảo hành trọn đời,hậu mãi,1 đổi 1", "BẢO HÀNH 24 THÁNG", "🛡️", "service,shop,time", {}),
    ("chuyen-gia", "chuyên gia,kinh nghiệm,10 năm,am hiểu", "CHUYÊN GIA 10 NĂM", "🎖️", "rating,win", {"num": 4.9}),
]
T2 += MORE
T += T2

ABSTRACT_SEEDS = 6

# Which templates can use a topic's "items", and in what shape.
_texts = lambda it: all(isinstance(x, str) for x in it)
ITEMS_OK = {tp: (lambda it: False) for g in GROUPS.values() for tp in g}
ITEMS_OK.update({tp: _texts for tp in ("checklist", "progress", "timeline_steps", "notifications", "ticker", "map_pins")})
ITEMS_OK["versus"] = lambda it: _texts(it) and len(it) == 2
ITEMS_OK["kpi"] = lambda it: isinstance(it[0], list)
ITEMS_OK["plane_route"] = lambda it: _texts(it) and len(it) == 2
NEEDS_ITEMS = {"checklist", "progress", "timeline_steps", "notifications", "map_pins", "kpi", "ticker", "plane_route"}


def slug(s):
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return "".join(ch if ch.isalnum() else "-" for ch in s).strip("-")


def pick_pals(key, k):
    start = zlib.crc32(key.encode()) % len(PALS)
    pals = ["ember"] + [PALS[(start + i * 3) % len(PALS)] for i in range(len(PALS))]
    out = []
    for p in pals:
        if p not in out:
            out.append(p)
    return out[:k]


def build():
    out = []
    for sl, tags, text, icon, groups, ex in T:
        tpls = []
        for g in groups.split(","):
            for tp in GROUPS[g]:
                if tp not in tpls:
                    tpls.append(tp)
        tags_l = [t.strip() for t in tags.split(",")]
        # Content-bearing templates only when the topic supplies its own items (their defaults are about video editing).
        tpls = [tp for tp in tpls if (tp not in NEEDS_ITEMS or ("items" in ex and ITEMS_OK[tp](ex["items"]))) and (tp != "chat" or "chat" in ex)]
        tpls = tpls or GROUPS["emotion"][:3]
        if "chat" in ex:
            tpls = ["chat"] + [tp for tp in tpls if tp != "chat"]  # a written conversation is the strongest visual for these topics
        for tp in tpls[:9]:
            for pal in pick_pals(sl + tp, 4):
                e = {"id": f"{sl}--{tp}--{pal}", "topic": sl, "template": tp, "pal": pal, "text": text, "icon": icon,
                     "seed": zlib.crc32((sl + tp).encode()) % 97 + 1, "tags": tags_l + [tp]}
                for k in ("num", "unit", "sub", "items"):
                    if k in ex:
                        e[k] = ex[k]
                if tp == "search":
                    e["text"] = ex.get("text_search", tags_l[0])
                if tp == "star_rating" and not (0 < e.get("num", 0) <= 5):
                    e["num"] = 4.9
                    e.pop("unit", None)
                if tp == "gauge" and not (0 < e.get("num", 0) <= 100 and e.get("unit", "%") == "%"):
                    continue  # a dial only makes sense for a real percentage
                if tp in ("price_tag", "shopping_cart") and "num" in e and e["num"] < 1000:
                    e.pop("num", None)
                    e.pop("unit", None)
                if tp == "pie" and not (0 < e.get("num", 78) <= 100 and e.get("unit", "%") == "%"):
                    e.pop("num", None)
                    e.pop("unit", None)
                if e.get("num", 0) >= 1000 and "unit" not in e:
                    e["unit"] = ""  # counts, not percentages
                if tp == "counter_big" and "num" not in ex:
                    e["num"] = 1000
                if tp == "versus" and "items" not in ex:
                    e["items"] = ["TRƯỚC", "SAU"]
                if tp == "chat":
                    e["items"] = ex["chat"]
                elif "items" in e and not ITEMS_OK[tp](e["items"]):
                    e.pop("items")  # template falls back to its own defaults
                if tp in ("typewriter", "quote_card", "glitch_text", "ticker", "icon_hero", "spotlight"):
                    e["sub"] = e.get("sub") or tags_l[0]
                out.append(e)
    for tp in GROUPS["abstract"]:
        for pal in PALS:
            for sd in range(1, ABSTRACT_SEEDS + 1):
                out.append({"id": f"bg--{tp}--{pal}--{sd}", "topic": "background", "template": tp, "pal": pal, "seed": sd,
                            "tags": ["nền", "background", "trừu tượng", "abstract", tp, pal]})
    return out


if __name__ == "__main__":
    dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "assets", "broll", "catalog.json")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cat = build()
    ids = [e["id"] for e in cat]
    assert len(ids) == len(set(ids)), "duplicate ids"
    json.dump(cat, open(dst, "w"), ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    print(f"{len(cat)} b-roll presets · {len(T)} topics · {len(set(e['template'] for e in cat))} templates -> {dst}")
    print(Counter(e["template"] for e in cat).most_common(6))
