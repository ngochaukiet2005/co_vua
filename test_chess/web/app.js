/* web/app.js */

const mainMenu = document.getElementById("mainMenu");
const gameUI   = document.getElementById("gameUI");
const boardEl  = document.getElementById("board");
const statusEl = document.getElementById("status"); 
const roomInfoEl = document.getElementById("roomInfo"); 
const gameStatusContainer = document.getElementById("gameStatus");
const gameContainer = document.getElementById('gameContainer'); // <-- Lấy container mới

// Các nút bấm mới
const btnPlay = document.getElementById("btnPlay");
const btnCreate = document.getElementById("btnCreate");
const btnJoin = document.getElementById("btnJoin");
const btnBack = document.getElementById("btnBack");
const roomInput = document.getElementById("roomInput");

let allValidMoves = []; // Lưu danh sách nước đi hợp lệ
let selectedPiece = null; // { r, c }
let socket = null;
let myColor = null;
let roomID = null;
let isMyTurn = false;
let currentState = { board: [], turn: "w" };
let pendingPromotionMove = null; // Chờ chọn phong cấp

/* web/app.js (Thay thế hàm cũ) */

function connectWebSocket(isReconnect = false) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        // Nếu đang kết nối lại và socket vẫn mở, gửi luôn
        if (isReconnect) {
            sendReconnectMessage();
        }
        return;
    }
    
    const serverIp = window.location.hostname; 
    socket = new WebSocket(`ws://${serverIp}:8765`);

    socket.onopen = () => {
        console.log("Connected to server");
        // Nếu đây là kết nối lại, gửi tin nhắn
        if (isReconnect) {
            sendReconnectMessage();
        }
    };

    socket.onclose = async () => {
        console.log("Disconnected from server");
        if (!roomID) { // Chỉ reload nếu đang ở menu
            await showCustomAlert("Mất kết nối. Đang tải lại...", "Mất kết nối");
            location.reload();
        } else {
            // Nếu đang trong game, chỉ báo lỗi
            statusEl.innerText = "Mất kết nối... Vui lòng F5.";
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
}

async function handleServerMessage(data) {
    switch (data.action) {
        case "waiting":
            statusEl.innerText = "Đang tìm đối thủ...";
            break;

        case "room_created":
            myColor = data.color;
            roomID = data.room_id;
            saveGameSession(roomID, myColor);
            statusEl.innerText = "Đã tạo phòng. Gửi mã này cho bạn bè:";
            roomInfoEl.innerText = roomID;
            gameStatusContainer.classList.remove("in-game");
            break;

        case "opponent_joined":
            statusEl.innerText = `Đối thủ đã tham gia. Bạn cầm quân: ${myColor === 'w' ? "TRẮNG" : "ĐEN"}`;
            gameStatusContainer.classList.add("in-game");
            
            startGameUI(); // <-- Sẽ hiện #gameContainer
            initPromotionModal();
            break;
            
        case "match_found":
            myColor = data.color;
            roomID = data.room;
            saveGameSession(roomID, myColor);
            statusEl.innerText = `Đã tìm thấy trận! Bạn cầm quân: ${myColor === 'w' ? "TRẮNG" : "ĐEN"}`;
            gameStatusContainer.classList.add("in-game");
            
            startGameUI(); // <-- Sẽ hiện #gameContainer

            initPromotionModal();
            break;

        case "update_board":
            currentState.board = data.board;
            currentState.turn = data.turn;
            allValidMoves = data.valid_moves || [];
            isMyTurn = (currentState.turn === myColor);
            
            renderBoard(); // Vẽ lại bàn cờ (xóa highlight cũ)
            
            // Highlight Vua bị chiếu
            if (data.check_pos) {
                const [r, c] = data.check_pos;
                const kingSquare = document.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
                if (kingSquare) kingSquare.classList.add("in-check");
            }
            
            let turnStatus = isMyTurn ? "Lượt của BẠN" : "Lượt ĐỐI THỦ";
            statusEl.innerText = `${turnStatus}. Bạn cầm quân: ${myColor === 'w' ? "TRẮNG" : "ĐEN"}`;
            
            if (data.status === "checkmate") {
                clearGameSession();
                const message = isMyTurn ? "Bạn đã bị chiếu hết. BẠN THUA!" : "Bạn đã chiếu hết đối thủ. BẠN THẮNG!";
                await showCustomAlert(message, "Trò chơi kết thúc");
                isMyTurn = false;
                setTimeout(() => location.reload(), 3000);
            } else if (data.status === "stalemate") {
                clearGameSession();
                await showCustomAlert("HÒA CỜ! (Stalemate).", "Trò chơi kết thúc");
                isMyTurn = false;
                setTimeout(() => location.reload(), 3000);
            }
            break;
            
        case "opponent_forfeited":
            clearGameSession();
            await showCustomAlert("Đối thủ đã thoát trận. Bạn thắng!", "Chiến thắng!");
            location.reload();
            break;

        case "opponent_disconnected":
            clearGameSession();
            await showCustomAlert("Đối thủ đã ngắt kết nối. Trò chơi kết thúc.", "Thông báo");
            location.reload();
            break;
        case "opponent_reconnecting": // <-- CASE MỚI TỪ SERVER
            statusEl.innerText = "Đối thủ đang kết nối lại... Vui lòng chờ.";
            break;
            
        case "opponent_reconnected": // <-- CASE MỚI TỪ SERVER
            statusEl.innerText = "Đối thủ đã kết nối lại. Trận đấu tiếp tục!";
            break;
        case "error":
            await showCustomAlert(`Lỗi: ${data.message}`, "Có lỗi xảy ra");
            mainMenu.style.display = "flex";
            gameUI.style.display = "none";
            break;
    }
}

// --- UI HANDLERS ---
window.addEventListener('load', loadGameSession);
function transitionToGameUI() {
    //connectWebSocket(); 
    mainMenu.style.display = "none";
    gameUI.style.display = "block";
    
    // SỬA LỖI Ở ĐÂY: Ẩn gameContainer (thay vì boardEl)
    gameContainer.style.display = "none"; 
    
    gameStatusContainer.classList.remove("in-game");
    statusEl.style.display = "block";
    roomInfoEl.style.display = "block";
}

/* web/app.js (CODE MỚI - ĐÃ SỬA) */

btnPlay.onclick = () => {
    transitionToGameUI();
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Sending matchmaking request...");
        socket.send(JSON.stringify({ action: "matchmaking" }));
    } else {
        console.error("Socket chưa sẵn sàng!");
    }
};

btnCreate.onclick = () => {
    transitionToGameUI();
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Sending create room request...");
        socket.send(JSON.stringify({ action: "create_room" }));
    } else {
        console.error("Socket chưa sẵn sàng!");
    }
};

btnJoin.onclick = () => {
    const id = roomInput.value.trim().toUpperCase();
    if (!id) {
        alert("Vui lòng nhập mã phòng.");
        return;
    }
    
    transitionToGameUI();
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log(`Sending join room request for ${id}...`);
        socket.send(JSON.stringify({ action: "join_room", "room_id": id }));
    } else {
        console.error("Socket chưa sẵn sàng!");
    }
};

btnBack.onclick = async () => {
    if (roomID) {
        const userConfirmed = await showCustomConfirm("Bạn có chắc muốn rời trận? Bạn sẽ bị xử thua.", "Xác nhận rời trận");
        if (userConfirmed) {
            clearGameSession();
            socket.send(JSON.stringify({
                action: "forfeit",
                room: roomID
            }));
            location.reload(); 
        }
    } else {
        clearGameSession();
        location.reload();
    }
};

function startGameUI() {
    // SỬA LỖI Ở ĐÂY: Hiện gameContainer (thay vì boardEl)
    gameContainer.style.display = "grid"; 
    
    if (myColor === 'b') {
        boardEl.classList.add("board-rotated");
    } else {
        boardEl.classList.remove("board-rotated");
    }
    initSquares();
}

const piecesImg = {
    // Quân Trắng
    wp: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg",
    wR: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
    wN: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
    wB: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
    wQ: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
    wK: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",

    // Quân Đen
    bp: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg",
    bR: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
    bN: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
    bB: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
    bQ: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
    bK: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg",
};

function initSquares() {
    boardEl.innerHTML = "";
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const div = document.createElement("div");
            div.className = `square ${(r + c) % 2 === 0 ? "light" : "dark"}`;
            div.dataset.r = r;
            div.dataset.c = c;
            div.onclick = () => handleSquareClick(r, c);
            div.ondragover = (e) => e.preventDefault();
            div.ondrop = handleDrop;
            boardEl.appendChild(div);
        }
    }
    //renderBoard(); 
}

function renderBoard() {
    document.querySelectorAll(".square.in-check").forEach(sq => sq.classList.remove("in-check"));
    const squares = document.querySelectorAll("#board .square"); 
    squares.forEach(sq => {
        sq.innerHTML = ""; 
        const r = parseInt(sq.dataset.r);
        const c = parseInt(sq.dataset.c);
        const pieceCode = currentState.board[r][c]; 
        
        if (pieceCode !== "--") {
            const pieceDiv = document.createElement("div");
            pieceDiv.className = "piece";
            pieceDiv.style.backgroundImage = `url('${piecesImg[pieceCode]}')`; 
            pieceDiv.dataset.r = r; 
            pieceDiv.dataset.c = c;

            if (isMyTurn && pieceCode[0] === myColor) {
                pieceDiv.draggable = true;
                pieceDiv.ondragstart = (e) => {
                    e.dataTransfer.setData("text/plain", JSON.stringify({ r, c }));
                    clearHighlights();
                };
                // Thêm click listener cho quân cờ
                pieceDiv.onclick = (e) => {
                    e.stopPropagation(); // Ngăn click vào square
                    handlePieceClick(r, c);
                };
            } else {
                pieceDiv.draggable = false;
                pieceDiv.style.cursor = "default";
            }
            sq.appendChild(pieceDiv);
        }
    });
}

// --- CÁC HÀM XỬ LÝ CLICK ---

function sendMove(r1, c1, r2, c2) {
    if (!isMyTurn) return;

    // Kiểm tra phong cấp
    const piece = currentState.board[r1][c1];
    const targetRank = (myColor === 'w') ? 0 : 7;

    if (piece.endsWith('p') && r2 === targetRank) {
        // Đây là nước đi phong cấp -> Hiển thị menu
        pendingPromotionMove = { r1, c1, r2, c2 };
        promotionModalOverlay.style.display = 'flex';
        // Đặt hình ảnh quân cờ đúng màu
        document.getElementById('promoChoiceQ').style.backgroundImage = `url('${piecesImg[myColor + 'Q']}')`;
        document.getElementById('promoChoiceR').style.backgroundImage = `url('${piecesImg[myColor + 'R']}')`;
        
        // ---------- SỬA LỖI TẠI ĐÂY -----------
        // Sửa 'piecesIg' thành 'piecesImg'
        document.getElementById('promoChoiceB').style.backgroundImage = `url('${piecesImg[myColor + 'B']}')`;
        // ----------------------------------------

        document.getElementById('promoChoiceN').style.backgroundImage = `url('${piecesImg[myColor + 'N']}')`;
    } else {
        // Nước đi bình thường
        socket.send(JSON.stringify({
            action: "move",
            room: roomID,
            from: [r1, c1],
            to: [r2, c2]
            // Không cần key "promotion", server sẽ mặc định là 'Q'
        }));
    }
    clearHighlights();
}

/* web/app.js */
function clearHighlights() {
    // Thêm .valid-move-empty và .valid-move-capture vào danh sách xóa
    document.querySelectorAll(".square.selected, .square.valid-move-empty, .square.valid-move-capture").forEach(sq => {
        sq.classList.remove("selected", "valid-move-empty", "valid-move-capture");
    });
    selectedPiece = null;
}

/* web/app.js */

function handlePieceClick(r, c) {
    if (!isMyTurn) return;
    if (selectedPiece && selectedPiece.r === r && selectedPiece.c === c) {
        clearHighlights();
        return;
    }
    clearHighlights();
    selectedPiece = { r, c };

    const square = document.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
    if (square) square.classList.add("selected");

    const validMovesForPiece = allValidMoves.filter(move => 
        move.from[0] === r && move.from[1] === c
    );

    // --- SỬA ĐỔI LOGIC TẠI ĐÂY ---
    validMovesForPiece.forEach(move => {
        const tr = move.to[0];
        const tc = move.to[1];
        const targetSquare = document.querySelector(`.square[data-r="${tr}"][data-c="${tc}"]`);

        if (targetSquare) {
            // Lấy quân cờ tại ô đích từ trạng thái bàn cờ
            const pieceOnTarget = currentState.board[tr][tc]; 
            
            if (pieceOnTarget === "--") {
                // Nếu ô trống, thêm class cho nước đi (dấu chấm)
                targetSquare.classList.add("valid-move-empty");
            } else {
                // Nếu ô có quân cờ (chắc chắn là quân địch, vì engine đã lọc),
                // thêm class cho nước ăn quân (màu xanh)
                targetSquare.classList.add("valid-move-capture");
            }
        }
    });
    // --- KẾT THÚC SỬA ĐỔI ---
}

function handleSquareClick(r, c) {
    if (!isMyTurn) return;
    if (!selectedPiece) return;

    const move = allValidMoves.find(m =>
        m.from[0] === selectedPiece.r && m.from[1] === selectedPiece.c &&
        m.to[0] === r && m.to[1] === c
    );

    if (move) {
        sendMove(selectedPiece.r, selectedPiece.c, r, c);
    } else {
        clearHighlights();
        const pieceCode = currentState.board[r][c];
        if (pieceCode !== "--" && pieceCode[0] === myColor) {
            handlePieceClick(r, c);
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (!isMyTurn) return;

    const dataRaw = e.dataTransfer.getData("text/plain");
    if (!dataRaw) return;

    const source = JSON.parse(dataRaw);
    let targetSq = e.target.closest(".square"); 

    if (targetSq) {
        const target = { 
            r: parseInt(targetSq.dataset.r), 
            c: parseInt(targetSq.dataset.c) 
        };
        sendMove(source.r, source.c, target.r, target.c);
    }
}

// --- HÀM CHO PHONG CẤP ---
const promotionModalOverlay = document.getElementById('promotionModalOverlay');
const promotionModalBox = document.getElementById('promotionModal'); // Hộp bên trong
/* web/app.js (Hàm MỚI - Đã thêm logic click overlay) */
function initPromotionModal() {
    console.log("Đang gán sự kiện cho các nút phong cấp...");
    document.getElementById('promoChoiceQ').onclick = () => sendPromotionChoice('Q');
    document.getElementById('promoChoiceR').onclick = () => sendPromotionChoice('R');
    document.getElementById('promoChoiceB').onclick = () => sendPromotionChoice('B');
    document.getElementById('promoChoiceN').onclick = () => sendPromotionChoice('N');

    // --- THÊM LOGIC MỚI ĐỂ ĐÓNG MODAL ---

    // 1. Ngăn click vào hộp modal (bên trong) làm tắt modal
    promotionModalBox.onclick = (e) => {
        e.stopPropagation(); // Rất quan trọng
    };

    // 2. Khi click vào overlay (bên ngoài)
    promotionModalOverlay.onclick = () => {
        console.log("Đã click bên ngoài, đóng modal phong cấp.");
        promotionModalOverlay.style.display = 'none';
        pendingPromotionMove = null; // Quan trọng: Hủy nước đi đang chờ
        clearHighlights(); // Xóa highlight
    };
}

/* app.js (Sửa hàm này) */

function sendPromotionChoice(piece) {
    // TEST 1: Kiểm tra xem hàm này có được gọi hay không
    console.log("Bạn đã chọn phong cấp:", piece); 

    if (!pendingPromotionMove) {
        console.error("LỖI: Không tìm thấy 'pendingPromotionMove'!");
        return;
    }
    
    const { r1, c1, r2, c2 } = pendingPromotionMove;

    // TEST 2: Xem dữ liệu chuẩn bị gửi đi
    const dataToSend = {
        action: "move",
        room: roomID,
        from: [r1, c1],
        to: [r2, c2],
        promotion: piece // Gửi quân cờ đã chọn
    };
    console.log("Chuẩn bị gửi lên server:", dataToSend);

    // Gửi nước đi với key "promotion"
    socket.send(JSON.stringify(dataToSend));

    // Ẩn menu và reset
    promotionModalOverlay.style.display = 'none';
    pendingPromotionMove = null;
    clearHighlights();
}
/* web/app.js (Thêm vào cuối file) */

// --- CÁC HÀM XỬ LÝ KẾT NỐI LẠI (RECONNECT) ---

function saveGameSession(id, color) {
    if (id && color) {
        sessionStorage.setItem('chessRoomID', id);
        sessionStorage.setItem('chessMyColor', color);
    }
}

function clearGameSession() {
    sessionStorage.removeItem('chessRoomID');
    sessionStorage.removeItem('chessMyColor');
}

function loadGameSession() {    
    // Hàm này sẽ được gọi ngay khi trang tải
    const savedRoom = sessionStorage.getItem('chessRoomID');
    const savedColor = sessionStorage.getItem('chessMyColor');

    if (savedRoom && savedColor) {
        console.log(`Tìm thấy phiên game cũ: Phòng ${savedRoom} - Màu ${savedColor}`);
        // 1. Cập nhật biến global
        roomID = savedRoom;
        myColor = savedColor;
        
        // 2. Chuyển ngay đến giao diện game
        mainMenu.style.display = "none";
        gameUI.style.display = "block";
        startGameUI();
        statusEl.innerText = "Đang kết nối lại trận đấu...";
        
        // 3. Kết nối và gửi yêu cầu 'reconnect'
        // (Chúng ta sẽ sửa hàm connectWebSocket() ngay sau đây)
        connectWebSocket(true); // true = Báo rằng đây là reconnect
    } else {
        // Không có game cũ, kết nối bình thường
        connectWebSocket(false);
    }
}
/* web/app.js (Thêm vào) */
function sendReconnectMessage() {
    if (roomID && myColor) {
        console.log("Gửi yêu cầu reconnect...");
        socket.send(JSON.stringify({
            action: "reconnect",
            room_id: roomID,
            color: myColor
        }));
    }
}
/* web/app.js (Thêm vào cuối file) */

// --- CÁC HÀM MODAL TÙY CHỈNH (MỚI) ---
const modalOverlay = document.getElementById('customModalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalBtnConfirm = document.getElementById('modalBtnConfirm');
const modalBtnCancel = document.getElementById('modalBtnCancel');

/**
 * Hiển thị một thông báo (thay thế cho alert).
 * @param {string} message - Nội dung thông báo.
 * @param {string} title - Tiêu đề của modal.
 * @returns {Promise<void>} - Một promise resolve khi người dùng bấm OK.
 */
function showCustomAlert(message, title = "Thông báo") {
    return new Promise((resolve) => {
        modalTitle.innerText = title;
        modalMessage.innerText = message;
        
        modalBtnConfirm.innerText = "OK";
        modalBtnCancel.style.display = "none"; // Ẩn nút Hủy

        modalOverlay.style.display = "flex";
        setTimeout(() => modalOverlay.classList.add("show"), 10); // Thêm class để hiện

        modalBtnConfirm.onclick = () => {
            modalOverlay.classList.remove("show");
            setTimeout(() => modalOverlay.style.display = "none", 300); // Đợi hiệu ứng
            resolve();
        };
    });
}

/**
 * Hiển thị một hộp thoại xác nhận (thay thế cho confirm).
 * @param {string} message - Câu hỏi xác nhận.
 * @param {string} title - Tiêu đề của modal.
 * @returns {Promise<boolean>} - Một promise resolve (true) nếu bấm Đồng ý, (false) nếu bấm Hủy.
 */
function showCustomConfirm(message, title = "Xác nhận") {
    return new Promise((resolve) => {
        modalTitle.innerText = title;
        modalMessage.innerText = message;
        
        modalBtnConfirm.innerText = "Đồng ý";
        modalBtnCancel.innerText = "Hủy";
        modalBtnCancel.style.display = "inline-block"; // Hiện nút Hủy

        modalOverlay.style.display = "flex";
        setTimeout(() => modalOverlay.classList.add("show"), 10); // Thêm class để hiện

        modalBtnConfirm.onclick = () => {
            modalOverlay.classList.remove("show");
            setTimeout(() => modalOverlay.style.display = "none", 300);
            resolve(true); // Resolve (true) khi Đồng ý
        };
        
        modalBtnCancel.onclick = () => {
            modalOverlay.classList.remove("show");
            setTimeout(() => modalOverlay.style.display = "none", 300);
            resolve(false); // Resolve (false) khi Hủy
        };
    });
}