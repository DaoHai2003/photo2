/**
 * Dashboard dark theme tokens — tông đen-xanh giống public album page.
 * Dùng làm constant để 4 file dashboard share cùng palette: layout, sidebar,
 * topbar, albums page. Đổi màu 1 chỗ → toàn dashboard đổi theo.
 */

// Backgrounds — soft dark navy/charcoal (giống tone Kitchor / public album).
// Không pure-black, có hint navy → ấm áp, sang trọng, không chói.
export const DARK_BG = '#1A1A2E';        // page background — navy dark
export const DARK_PANEL = '#15152A';     // sidebar / topbar — đậm hơn 1 chút
export const DARK_CARD = '#22223C';      // cards / list items — sáng hơn để nổi
export const DARK_HOVER = '#2A2A48';     // hover state
export const DARK_BORDER = 'rgba(255,255,255,0.06)';
export const DARK_BORDER_STRONG = 'rgba(255,255,255,0.12)';

// Accent — warm gold/champagne (đồng bộ với public album page).
// Aliases CYAN/TEAL/GLOW giữ tên cũ để không phải đổi import ở các file khác,
// nhưng VALUE đã chuyển sang gold ấm.
export const ACCENT_CYAN = '#C9A96E';    // primary accent — warm gold
export const ACCENT_TEAL = '#B8964F';    // secondary — gold đậm hơn
export const ACCENT_GLOW = 'rgba(201, 169, 110, 0.18)';

// Text
export const TEXT_PRIMARY = '#E8E6E3';   // off-white ấm, dễ đọc trên navy
export const TEXT_SECONDARY = '#A8A8B8'; // muted lavender-gray
export const TEXT_MUTED = '#6B6B7E';     // mờ hơn nữa
