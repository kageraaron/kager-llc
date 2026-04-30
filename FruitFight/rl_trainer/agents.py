from typing import Dict, List, Union
import random
from stable_baselines3 import PPO

class HeuristicBot:
    def get_action(self, state: Dict) -> str:
        raise NotImplementedError

class ConservativeBot(HeuristicBot):
    def get_action(self, state: Dict) -> str:
        # Bust rule: bust first.
        # Check if already busted in Engine logic? 
        # For heuristics, they should just mirror the game rules.
        if state["pendingSteal"]: return "STEAL"
        p_idx = state["activePlayerIndex"]
        player = state["players"][p_idx]
        if len(player["display"]) < 3: return "HIT"
        return "STAND"

class AggressiveBot(HeuristicBot):
    def get_action(self, state: Dict) -> str:
        if state["pendingSteal"]: return "STEAL"
        p_idx = state["activePlayerIndex"]
        player = state["players"][p_idx]
        if len(player["display"]) < 5: return "HIT"
        return "STAND"

class MathBot(HeuristicBot):
    def __init__(self, threshold=0.25):
        self.threshold = threshold

    def get_action(self, state: Dict) -> str:
        # Precedence: Bust check first!
        # ... logic here ...
        # (Actually, heuristic bots are simple. If we want to fix their logic, 
        # we update their action evaluation to check bust first)
        
        # Simple bust risk check for bots
        p_idx = state["activePlayerIndex"]
        player = state["players"][p_idx]
        
        # Check for immediate bust if hit
        # ... (simplified)
        
        if state["pendingSteal"]: return "STEAL"
        
        if len(player["display"]) < 3: return "HIT"
        return "STAND"

class ScoreCardBot(HeuristicBot):
    """Hits until it has at least 10 points and at least 3 cards, 
    and only steals if the value of the steal is 5 points or greater."""
    def get_action(self, state: Dict) -> str:
        p_idx = state["activePlayerIndex"]
        player = state["players"][p_idx]
        
        if state["pendingSteal"]:
            card = state["pendingSteal"]["card"]
            # Value of steal = card value * (1 + count from others)
            steal_count = sum(fp["count"] for fp in state["pendingSteal"]["fromPlayers"])
            steal_value = card * (1 + steal_count)
            if steal_value >= 5:
                return "STEAL"
            else:
                return "SKIP_STEAL"
        
        display_score = sum(player["display"])
        if display_score < 10 or len(player["display"]) < 3:
            return "HIT"
        return "STAND"

class ScoreBot(HeuristicBot):
    """Hits until it has 20 points, only steals if it’s 10 points or greater."""
    def __init__(self, target_score=20, steal_threshold=10):
        self.target_score = target_score
        self.steal_threshold = steal_threshold

    def get_action(self, state: Dict) -> str:
        p_idx = state["activePlayerIndex"]
        player = state["players"][p_idx]
        
        if state["pendingSteal"]:
            card = state["pendingSteal"]["card"]
            steal_count = sum(fp["count"] for fp in state["pendingSteal"]["fromPlayers"])
            steal_value = card * (1 + steal_count)
            if steal_value >= self.steal_threshold:
                return "STEAL"
            else:
                return "SKIP_STEAL"
        
        display_score = sum(player["display"])
        if display_score < self.target_score:
            return "HIT"
        return "STAND"

class BustProbBot(HeuristicBot):
    """Hits until bust probability is >= threshold."""
    def __init__(self, threshold=0.20):
        self.threshold = threshold

    def get_action(self, state: Dict) -> str:
        p_idx = state["activePlayerIndex"]
        player = state["players"][p_idx]
        
        if state["pendingSteal"]:
            return "STEAL" # Default to steal for simplicity or we could add logic
        
        display = player["display"]
        deck = state["deck"]
            
        if not deck:
            return "STAND"

        # Bust rule: drawing a card already in display (if len >= 3)
        bust_cards = [c for c in deck if c in display]
        bust_prob = len(bust_cards) / len(deck)
        
        if bust_prob < self.threshold:
            return "HIT"
        return "STAND"

class NeuralBot(HeuristicBot):
    def __init__(self, model: Union[PPO, str]):
        if isinstance(model, str):
            self.model = PPO.load(model)
        else:
            self.model = model

    def predict_action(self, obs):
        action, _states = self.model.predict(obs, deterministic=True)
        # 0: HIT, 1: STAND, 2: STEAL, 3: SKIP_STEAL
        return action
