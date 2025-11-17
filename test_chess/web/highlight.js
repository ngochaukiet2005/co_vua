// [TỆP MỚI: web/highlight.js]

// Biến này giờ sẽ được quản lý bên trong module
let lastMove = null;

/**
 * Lưu trữ nước đi cuối cùng.
 * @param {object | null} move - Đối tượng nước đi (ví dụ: {from: [r,c], to: [r,c]})
 */
function setLastMove(move) {
    lastMove = move || null;
}

/**
 * Xóa highlight của nước đi trước đó khỏi bàn cờ.
 */
function clearLastMoveHighlights() {
    document.querySelectorAll(".square.last-move-from, .square.last-move-to").forEach(sq => {
        sq.classList.remove("last-move-from", "last-move-to");
    });
}

/**
 * Áp dụng highlight cho nước đi cuối cùng (đã được lưu).
 */
function applyLastMoveHighlights() {
    // Nếu không có nước đi (lượt đầu) thì không làm gì
    if (!lastMove) return; 

    const [fromR, fromC] = lastMove.from;
    const [toR, toC] = lastMove.to;

    const fromSquare = document.querySelector(`.square[data-r="${fromR}"][data-c="${fromC}"]`);
    const toSquare = document.querySelector(`.square[data-r="${toR}"][data-c="${toC}"]`);
    
    // Highlight ô bắt đầu (vị trí cũ)
    if (fromSquare) fromSquare.classList.add("last-move-from");
    // Highlight ô kết thúc (vị trí mới)
    if (toSquare) toSquare.classList.add("last-move-to");
}

// "Xuất" các hàm này ra để tệp khác có thể sử dụng
export { setLastMove, clearLastMoveHighlights, applyLastMoveHighlights };