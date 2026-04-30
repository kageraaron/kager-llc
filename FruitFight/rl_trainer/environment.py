import gymnasium as gym
from gymnasium import spaces
import numpy as np
from rl_trainer.game_engine import GameEngine, CARD_VALUES, CARD_COUNTS

from collections import deque

class FruitFightEnv(gym.Env):
    def __init__(self, opponents=None):
        super(FruitFightEnv, self).__init__()
        self.opponents = opponents if opponents else []
        self.engine = GameEngine(num_players=4)
        
        self.action_space = spaces.Discrete(4)
        self.observation_space = spaces.Box(low=0, high=1, shape=(119,), dtype=np.float32)
        self.episode_history = deque(maxlen=100)
        self.current_episode_score = 0

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        num_players = np.random.randint(3, 6)
        self.engine = GameEngine(num_players=num_players)
        self.engine.active_player_idx = np.random.randint(0, num_players)
        self._advance_to_ai_turn()
        return self._get_obs(), {}

    def step(self, action):
        illegal_action = False
        
        if self.engine.pending_steal:
            if action == 2: self.engine.confirm_steal()
            elif action == 3: self.engine.decline_steal()
            else: illegal_action = True
        else:
            if action == 0: self.engine.draw_card()
            elif action == 1: self.engine.end_turn()
            else: illegal_action = True

        self._advance_to_ai_turn()

        reward = 0
        terminated = self.engine.is_game_over
        if illegal_action: reward = -0.5
        
        if terminated:
            scores = [p.get_score() for p in self.engine.players]
            my_score = scores[0]
            max_opp_score = max(scores[1:]) if len(scores) > 1 else 0
            reward = (my_score - max_opp_score) / 500.0
            
            self.episode_history.append({
                "win": 1 if my_score > max_opp_score else 0,
                "score": my_score
            })

        return self._get_obs(), reward, terminated, False, {}

    def _advance_to_ai_turn(self):
        from agents import NeuralBot, HeuristicBot
        max_steps = 1000
        steps = 0
        while not self.engine.is_game_over and self.engine.active_player_idx != 0 and steps < max_steps:
            steps += 1
            if not self.engine.turn_started: self.engine.start_turn()
                
            p_idx = self.engine.active_player_idx
            # Handling variable opponents
            opp_idx = p_idx - 1
            opp = self.opponents[opp_idx % len(self.opponents)] if self.opponents else None
            
            if opp:
                if isinstance(opp, NeuralBot):
                    obs = self._get_obs(p_idx)
                    action_idx = opp.predict_action(obs)
                    if self.engine.pending_steal:
                        if action_idx == 2: self.engine.confirm_steal()
                        else: self.engine.decline_steal()
                    else:
                        if action_idx == 0: self.engine.draw_card()
                        else: self.engine.end_turn()
                elif isinstance(opp, HeuristicBot):
                    state = self.engine.get_state_dict()
                    action = opp.get_action(state)
                    if action == "HIT": self.engine.draw_card()
                    elif action == "STAND": self.engine.end_turn()
                    elif action == "STEAL": self.engine.confirm_steal()
                    elif action == "SKIP_STEAL": self.engine.decline_steal()
                    else: self.engine.end_turn() # Fallback
                else:
                    self.engine.end_turn()
            else:
                self.engine.end_turn()

    def _get_obs(self, p_idx=0):
        state = self.engine.get_state_dict()
        players = self.engine.players
        num_players = self.engine.num_players
        
        def cards_to_dist(cards):
            d = np.zeros(10)
            for c in cards: d[c-1] += 1
            return d
            
        score_piles = []
        for i in range(5):
            if i < num_players: score_piles.extend(cards_to_dist(players[(p_idx + i) % num_players].score_pile) / 50.0)
            else: score_piles.extend(np.zeros(10))

        my_display = cards_to_dist(players[p_idx % num_players].display) / 11.0
        deck_dist = cards_to_dist(state["deck"]) / 11.0
        
        opp_displays = []
        for i in range(1, 5):
            if i < num_players: opp_displays.extend(cards_to_dist(players[(p_idx + i) % num_players].display) / 11.0)
            else: opp_displays.extend(np.zeros(10))
            
        discard_pile = cards_to_dist(state["discardPile"]) / 50.0
        is_pending = np.array([1.0 if state["pendingSteal"] else 0.0])
        steal_info = np.zeros(13)
        if state["pendingSteal"]:
            card = state["pendingSteal"]["card"]
            steal_info[card-1] = 1.0
            
        global_stats = np.array([len(state["deck"])/50.0, players[p_idx % num_players].get_score()/500.0, state["activePlayerIndex"]/float(num_players), 1.0 if state["turnStarted"] else 0.0, 0.0])
        
        # Padding to 119
        obs = np.concatenate([score_piles, my_display, deck_dist, opp_displays, discard_pile, is_pending, steal_info, global_stats]).astype(np.float32)
        return obs[:119] # Truncate if over

