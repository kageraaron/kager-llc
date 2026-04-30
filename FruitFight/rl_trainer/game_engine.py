import random
from typing import List, Dict, Optional

NUM_PLAYERS = 4
CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
CARD_COUNTS = {
    1: 11, 2: 11, 3: 11, 4: 11, 5: 11,
    6: 7, 7: 7, 8: 7, 9: 7, 10: 7
}

class Player:
    def __init__(self, id: int, name: str):
        self.id = id
        self.name = name
        self.score_pile: List[int] = []
        self.display: List[int] = []

    def get_score(self) -> int:
        return sum(self.score_pile)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "scorePile": self.score_pile[:],
            "display": self.display[:]
        }

class GameEngine:
    def __init__(self, num_players=4):
        self.num_players = num_players
        self.deck: List[int] = self.create_deck()
        self.players: List[Player] = [Player(i, f"Player {i}") for i in range(num_players)]
        self.discard_pile: List[int] = []
        self.active_player_idx = 0
        self.turn_started = False
        self.pending_steal: Optional[Dict] = None
        self.is_game_over = False

    def create_deck(self) -> List[int]:
        deck = []
        for val, count in CARD_COUNTS.items():
            deck.extend([val] * count)
        random.shuffle(deck)
        return deck

    def start_turn(self):
        if self.turn_started or self.is_game_over:
            return

        if not self.players or self.active_player_idx >= len(self.players):
             self.active_player_idx = 0
             
        active_player = self.players[self.active_player_idx]
        if active_player.display:
            active_player.score_pile.extend(active_player.display)
            active_player.display = []
        
        self.turn_started = True

    def draw_card(self):
        if not self.deck or self.is_game_over or self.pending_steal:
            return

        if not self.players or self.active_player_idx >= len(self.players):
             self.active_player_idx = 0
             
        card = self.deck.pop()
        active_player = self.players[self.active_player_idx]

        # 1. Bust Check: Check if this draw would cause a bust BEFORE adding to display.
        # Bust rule: "Once they have at least 3 cards in their hand, the next time they draw a card of a value they already have, they bust."
        is_bust = len(active_player.display) >= 3 and card in active_player.display

        if is_bust:
            self.discard_pile.extend(active_player.display)
            active_player.display = []
            self.end_turn()
            return # Bust happens, turn ends immediately.

        # 2. Steal Check (only if NO bust)
        # Check for steal opportunities based on the drawn card and other players' displays.
        stealable_players = [p for i, p in enumerate(self.players) if i != self.active_player_idx and card in p.display]
        
        # If steal possible, pause turn for decision.
        if stealable_players:
            self.pending_steal = {
                "card": card,
                "fromPlayers": [{"playerId": p.id, "count": p.display.count(card)} for p in stealable_players]
            }
            return

        # 3. No Bust, No Steal: Simply add card to display
        active_player.display.append(card)
        
        if not self.deck:
            self.finalize_game()
        else:
            self.end_turn()



    def confirm_steal(self):
        if not self.pending_steal:
            return
        
        card = self.pending_steal["card"]
        active_player = self.players[self.active_player_idx]
        active_player.display.append(card)

        for fp in self.pending_steal["fromPlayers"]:
            target = self.players[fp["playerId"]]
            stolen = [c for c in target.display if c == card]
            active_player.display.extend(stolen)
            target.display = [c for c in target.display if c != card]

        self.pending_steal = None
        if not self.deck:
            self.finalize_game()
        else:
            self.end_turn()

    def decline_steal(self):
        if not self.pending_steal:
            return
        
        card = self.pending_steal["card"]
        self.players[self.active_player_idx].display.append(card)
        self.pending_steal = None
        if not self.deck:
            self.finalize_game()
        else:
            self.end_turn()

    def end_turn(self):
        if self.is_game_over:
            return
        self.active_player_idx = (self.active_player_idx + 1) % self.num_players
        self.turn_started = False
        self.pending_steal = None

    def finalize_game(self):
        for p in self.players:
            p.score_pile.extend(p.display)
            p.display = []
        self.is_game_over = True

    def get_state_dict(self) -> Dict:
        return {
            "deck": self.deck[:],
            "players": [p.to_dict() for p in self.players],
            "discardPile": self.discard_pile[:],
            "activePlayerIndex": self.active_player_idx,
            "turnStarted": self.turn_started,
            "pendingSteal": self.pending_steal,
            "isGameOver": self.is_game_over
        }
