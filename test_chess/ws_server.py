import asyncio
import websockets
import json
import random
import string
import sys
import os
import time
# Đảm bảo Python tìm thấy thư mục engine
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from engine.ChessEngine import GameState, Move
RECONNECT_TIMEOUT = 30
waiting_player = None
rooms = {}      # {room_id: [ws1, ws2]}
games = {}      # {room_id: GameState_Object}

def serialize_moves(moves_list):
    """Chuyển đổi danh sách Move thành JSON, bao gồm promotionPiece."""
    serialized = []
    for move in moves_list:
        m = {
            "from": [move.sqStart[0], move.sqStart[1]],
            "to": [move.sqEnd[0], move.sqEnd[1]]
        }

        # --- Thêm phần quan trọng ---
        if move.isPawnPromotion:
            m["promotion"] = move.promotionPiece
        # ----------------------------

        serialized.append(m)

    return serialized

def make_room_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

async def safe_send(ws, data):
    try:
        await ws.send(json.dumps(data))
    except:
        pass
async def schedule_room_cleanup(room_id, color_to_check):
    """
    Chờ RECONNECT_TIMEOUT giây, sau đó kiểm tra xem người chơi đã kết nối lại chưa.
    Nếu chưa, hãy dọn dẹp phòng.
    """
    await asyncio.sleep(RECONNECT_TIMEOUT)
    try:
        if room_id in rooms and rooms[room_id][color_to_check] is None:
            print(f"[Timer] Dọn dẹp phòng {room_id} do {color_to_check} không kết nối lại.")
            
            # Báo cho người chơi còn lại (nếu có)
            opponent_color = 'b' if color_to_check == 'w' else 'w'
            opponent_ws = rooms[room_id].get(opponent_color)
            if opponent_ws:
                await safe_send(opponent_ws, {"action": "opponent_forfeited"})

            # Dọn dẹp
            del rooms[room_id]
            if room_id in games:
                del games[room_id]
    except Exception as e:
        print(f"[Timer Error] Lỗi khi dọn dẹp {room_id}: {e}")

# --- THAY THẾ TOÀN BỘ HÀM HANDLER TRONG ws_server.py ---

async def handler(ws):
    global waiting_player
    print("Client connected")
    
    # Gán thuộc tính vào ws để theo dõi
    ws.my_room_id = None
    ws.my_color = None
    ws.forfeited = False

    try:
        async for raw in ws:
            data = json.loads(raw)
            action = data.get("action")
            
            # --- TÌM TRẬN NHANH (MATCHMAKING) ---
            if action == "matchmaking":
                if waiting_player is None:
                    waiting_player = ws
                    await safe_send(ws, {"action": "waiting"})
                else:
                    p1 = waiting_player
                    p2 = ws
                    waiting_player = None
                    
                    room_id = make_room_id()
                    
                    # Gán thuộc tính cho cả 2 người chơi
                    p1.my_room_id = room_id
                    p1.my_color = "w"
                    p2.my_room_id = room_id
                    p2.my_color = "b"

                    # --- SỬA CẤU TRÚC ROOMS (QUAN TRỌNG) ---
                    rooms[room_id] = {"w": p1, "b": p2, "timer": None} 
                    games[room_id] = GameState()
                    
                    print(f"Matchmaking: Room {room_id} created")

                    await safe_send(p1, {"action": "match_found", "room": room_id, "color": "w"})
                    await safe_send(p2, {"action": "match_found", "room": room_id, "color": "b"})
                    
                    gs = games[room_id]
                    valid_moves = gs.getValidMoves()
                    initial_state = {
                        "action": "update_board", 
                        "board": gs.board, 
                        "turn": gs.turn,
                        "status": "playing",
                        "valid_moves": serialize_moves(valid_moves),
                        "check_pos": None
                    }
                    await safe_send(p1, initial_state)
                    await safe_send(p2, initial_state)

            # --- TẠO PHÒNG MỚI ---
            elif action == "create_room":
                room_id = make_room_id()
                ws.my_room_id = room_id
                ws.my_color = "w"
                
                # --- SỬA CẤU TRÚC ROOMS (QUAN TRỌNG) ---
                rooms[room_id] = {"w": ws, "b": None, "timer": None} 
                games[room_id] = GameState()
                print(f"Custom Room: Room {room_id} created by one player")
                await safe_send(ws, {"action": "room_created", "room_id": room_id, "color": "w"})

            # --- THAM GIA PHÒNG ---
            elif action == "join_room":
                room_id = data.get("room_id").upper()
                
                if room_id not in rooms:
                    await safe_send(ws, {"action": "error", "message": "Không tìm thấy phòng."})
                # --- SỬA LOGIC KIỂM TRA (QUAN TRỌNG) ---
                elif rooms[room_id]["b"] is not None: 
                    await safe_send(ws, {"action": "error", "message": "Phòng đã đầy."})
                else:
                    ws.my_room_id = room_id
                    ws.my_color = "b"
                    rooms[room_id]["b"] = ws # Đặt người chơi vào vị trí "b"
                    
                    p1 = rooms[room_id]["w"]
                    p2 = ws
                    
                    print(f"Custom Room: Player joined {room_id}. Starting game.")

                    await safe_send(p2, {"action": "match_found", "room": room_id, "color": "b"})
                    await safe_send(p1, {"action": "opponent_joined", "room": room_id})

                    gs = games[room_id]
                    valid_moves = gs.getValidMoves()
                    initial_state = {
                        "action": "update_board", 
                        "board": gs.board, 
                        "turn": gs.turn,
                        "status": "playing",
                        "valid_moves": serialize_moves(valid_moves),
                        "check_pos": None
                    }
                    await safe_send(p1, initial_state)
                    await safe_send(p2, initial_state)

            # --- ACTION KẾT NỐI LẠI (MỚI) ---
            elif action == "reconnect":
                room_id = data.get("room_id")
                color = data.get("color")
                
                if room_id in rooms and rooms[room_id].get(color) is None:
                    # Vị trí đang trống, cho phép kết nối lại
                    ws.my_room_id = room_id
                    ws.my_color = color
                    rooms[room_id][color] = ws
                    
                    print(f"[Reconnect] Người chơi {color} đã kết nối lại phòng {room_id}")

                    # Hủy timer dọn dẹp (nếu có)
                    if rooms[room_id]["timer"]:
                        rooms[room_id]["timer"].cancel()
                        rooms[room_id]["timer"] = None
                        print(f"[Reconnect] Đã hủy timer dọn dẹp cho {room_id}")

                    # Gửi trạng thái bàn cờ cho người chơi
                    gs = games[room_id]
                    valid_moves = gs.getValidMoves()
                    initial_state = {
                        "action": "update_board", 
                        "board": gs.board, 
                        "turn": gs.turn,
                        "status": "playing",
                        "valid_moves": serialize_moves(valid_moves),
                        "check_pos": None
                    }
                    await safe_send(ws, initial_state)
                    
                    # Báo cho đối thủ
                    opponent_color = 'b' if color == 'w' else 'w'
                    opponent_ws = rooms[room_id].get(opponent_color)
                    if opponent_ws:
                        await safe_send(opponent_ws, {"action": "opponent_reconnected"})
                        # Gửi luôn bàn cờ cho đối thủ để đồng bộ
                        await safe_send(opponent_ws, initial_state)
                else:
                    # Không tìm thấy phòng hoặc vị trí đã có người
                    await safe_send(ws, {"action": "error", "message": "Không thể kết nối lại."})


            # --- ACTION XỬ THUA ---
            elif action == "forfeit":
                if ws.my_room_id:
                    ws.forfeited = True
                    print(f"Player {ws.my_color} in {ws.my_room_id} is forfeiting.")
                    # (Logic dọn dẹp sẽ nằm trong 'finally')

            # --- XỬ LÝ NƯỚC ĐI (Cập nhật cách gửi tin nhắn) ---
            elif action == "move":
                room_id = data.get("room")
                promotion_choice = data.get("promotion", "Q")
                
                if room_id in games:
                    gs = games[room_id]
                    
                    # (Thêm) Kiểm tra lượt đi
                    if gs.turn != ws.my_color:
                        print(f"Lỗi: {ws.my_color} đi không đúng lượt ({gs.turn})")
                        continue # Bỏ qua nước đi
                        
                    validMoves = gs.getValidMoves()
                    
                    f = data.get("from") 
                    t = data.get("to")
                    sqStart = (f[0], f[1])
                    sqEnd = (t[0], t[1])
                    
                    move_to_make = None
                    for valid_move in validMoves:
                        if valid_move.sqStart == sqStart and valid_move.sqEnd == sqEnd:
                            if valid_move.isPawnPromotion:
                                if valid_move.promotionPiece == promotion_choice:
                                    move_to_make = valid_move
                                    break
                            else:
                                move_to_make = valid_move
                                break
                    
                    if move_to_make:
                        gs.makeMove(move_to_make)
                        
                        status = "playing"
                        king_in_check_pos = None
                        next_turn_moves = gs.getValidMoves()
                        
                        if gs.inCheck:
                            if not next_turn_moves:
                                status = "checkmate"
                            king_in_check_pos = gs.kingLocation[gs.turn]
                        else:
                            if not next_turn_moves:
                                status = "stalemate"

                        response = {
                            "action": "update_board",
                            "board": gs.board,
                            "turn": gs.turn,
                            "status": status,
                            "valid_moves": serialize_moves(next_turn_moves),
                            "check_pos": king_in_check_pos
                        }
                        
                        # --- SỬA CÁCH GỬI (QUAN TRỌNG) ---
                        p_w = rooms[room_id].get("w")
                        p_b = rooms[room_id].get("b")
                        if p_w: await safe_send(p_w, response)
                        if p_b: await safe_send(p_b, response)
                    else:
                        print(f"Nuoc di khong hop le! Yeu cau: {sqStart} -> {sqEnd} (Promo: {promotion_choice})")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        # --- LOGIC DỌN DẸP (THAY ĐỔI LỚN) ---
        print(f"Client disconnected. Cleaning up room: {ws.my_room_id}")
        
        if ws == waiting_player:
            waiting_player = None
            print("Waiting player disconnected.")
        
        room_id = ws.my_room_id
        color = ws.my_color
        
        if room_id and room_id in rooms:
            # Đặt vị trí của người chơi thành None
            if color: # Chỉ làm nếu người chơi đã được gán màu
                rooms[room_id][color] = None
            
            opponent_color = 'b' if color == 'w' else 'w'
            opponent_ws = rooms[room_id].get(opponent_color)
            
            if ws.forfeited:
                # Nếu chủ động xử thua, dọn dẹp ngay
                print(f"Room {room_id} closed due to forfeit by {color}.")
                if opponent_ws:
                    await safe_send(opponent_ws, {"action": "opponent_forfeited"})
                
                # Hủy timer (nếu có) và xóa phòng
                if rooms[room_id].get("timer"):
                    rooms[room_id]["timer"].cancel()
                del rooms[room_id]
                if room_id in games:
                    del games[room_id]
            
            elif opponent_ws:
                # Nếu đối thủ VẪN CÒN, báo họ và bật timer
                print(f"Player {color} disconnected from {room_id}. Starting timer...")
                await safe_send(opponent_ws, {"action": "opponent_reconnecting"})
                
                # Bật timer (hủy timer cũ nếu có)
                if rooms[room_id].get("timer"):
                    rooms[room_id]["timer"].cancel()
                rooms[room_id]["timer"] = asyncio.create_task(schedule_room_cleanup(room_id, color))
            
            else:
                # Cả 2 đều đã mất kết nối.
                if rooms[room_id].get(opponent_color) is None and rooms[room_id].get(color) is None:
                    print(f"Room {room_id}: Both players disconnected. Deleting.")
                    if rooms[room_id].get("timer"):
                        rooms[room_id]["timer"].cancel()
                    del rooms[room_id]
                    if room_id in games:
                        del games[room_id]
async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("Server running on ws://localhost:8765")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())