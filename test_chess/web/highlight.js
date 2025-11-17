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
    // Sử dụng class .last-move-start và .last-move-end
    document.querySelectorAll(".square.last-move-start, .square.last-move-end").forEach(sq => {
        sq.classList.remove("last-move-start", "last-move-end");
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
    
    // Highlight ô bắt đầu (vị trí cũ) -> Dùng class "last-move-start"
    if (fromSquare) fromSquare.classList.add("last-move-start");
    
    // Highlight ô kết thúc (vị trí mới) -> Dùng class "last-move-end"
    if (toSquare) toSquare.classList.add("last-move-end");
}

// "Xuất" các hàm này ra để tệp khác có thể sử dụng
export { setLastMove, clearLastMoveHighlights, applyLastMoveHighlights };