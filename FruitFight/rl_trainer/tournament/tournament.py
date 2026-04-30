import os
import glob
import random
from collections import defaultdict
from rl_trainer.game_engine import GameEngine
from rl_trainer.agents import NeuralBot
from rl_trainer.environment import FruitFightEnv
from stable_baselines3 import PPO
import numpy as np

def cards_to_dist(cards):
    d = np.zeros(10)
    for c in cards: d[c-1] += 1
    return d

def get_obs_69(engine, p_idx):
    state = engine.get_state_dict()
    players = engine.players
    num_players = engine.num_players
    
    my_score_pile = cards_to_dist(players[p_idx].score_pile) / 50.0
    my_display = cards_to_dist(players[p_idx].display) / 11.0
    deck_dist = cards_to_dist(state["deck"]) / 11.0
    
    next_p_idx = (p_idx + 1) % num_players
    opp_display = cards_to_dist(players[next_p_idx].display) / 11.0
    
    discard_pile = cards_to_dist(state["discardPile"]) / 50.0
    
    is_pending = np.array([1.0 if state["pendingSteal"] else 0.0])
    steal_info = np.zeros(13)
    if state["pendingSteal"]:
        card = state["pendingSteal"]["card"]
        steal_info[card-1] = 1.0
        
    global_stats = np.array([
        len(state["deck"])/50.0, 
        players[p_idx].get_score()/500.0, 
        state["activePlayerIndex"]/float(num_players), 
        1.0 if state["turnStarted"] else 0.0, 
        0.0
    ])
    
    return np.concatenate([
        my_score_pile, my_display, deck_dist, opp_display, discard_pile, 
        is_pending, steal_info, global_stats
    ]).astype(np.float32)

def get_obs_119(engine, p_idx):
    state = engine.get_state_dict()
    players = engine.players
    num_players = engine.num_players
    
    score_piles = []
    for i in range(5):
        if i < num_players: score_piles.extend(cards_to_dist(players[(p_idx + i) % num_players].score_pile) / 50.0)
        else: score_piles.extend(np.zeros(10))

    my_display = cards_to_dist(players[p_idx].display) / 11.0
    deck_dist = cards_to_dist(state["deck"]) / 11.0
    
    opp_displays = []
    for i in range(1, 3): 
        if i < num_players: opp_displays.extend(cards_to_dist(players[(p_idx + i) % num_players].display) / 11.0)
        else: opp_displays.extend(np.zeros(10))
            
    discard_pile = cards_to_dist(state["discardPile"]) / 50.0
    
    is_pending = np.array([1.0 if state["pendingSteal"] else 0.0])
    steal_info = np.zeros(13)
    if state["pendingSteal"]:
        card = state["pendingSteal"]["card"]
        steal_info[card-1] = 1.0
        
    global_stats = np.array([
        len(state["deck"])/50.0, 
        players[p_idx].get_score()/500.0, 
        state["activePlayerIndex"]/float(num_players), 
        1.0 if state["turnStarted"] else 0.0, 
        0.0
    ])
    
    return np.concatenate([
        score_piles, my_display, deck_dist, opp_displays, discard_pile, 
        is_pending, steal_info, global_stats
    ]).astype(np.float32)

def run_tournament(checkpoint_dir=None, num_games=5000):
    if checkpoint_dir is None:
        checkpoint_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "checkpoints")
    
    checkpoint_dir = os.path.abspath(checkpoint_dir)
    print(f"Looking for checkpoints in: {checkpoint_dir}")
    
    checkpoints = glob.glob(os.path.join(checkpoint_dir, "*.zip"))
    if not checkpoints:
        print(f"No checkpoints found in {checkpoint_dir}")
        return

    print(f"Loading {len(checkpoints)} models...")
    models_data = {}
    for cp in checkpoints:
        name = os.path.basename(cp)
        try:
            model = PPO.load(cp)
            obs_size = model.observation_space.shape[0]
            models_data[name] = {
                "model": model,
                "obs_size": obs_size
            }
        except Exception as e:
            print(f"Error loading {name}: {e}")

    stats = defaultdict(lambda: {"wins": 0, "games": 0, "total_score": 0, "total_diff": 0})
    
    print(f"Starting tournament: {num_games} games, 3-5 models per game.")
    
    model_names = list(models_data.keys())
    
    for game_idx in range(num_games):
        if (game_idx + 1) % 100 == 0:
            print(f"Played {game_idx + 1}/{num_games} games...")
            
        num_players = random.randint(3, 5)
        selected_names = random.sample(model_names, num_players)
        
        engine = GameEngine(num_players=num_players)
        
        engine.start_turn()
        steps = 0
        while not engine.is_game_over and steps < 1000:
            steps += 1
            p_idx = engine.active_player_idx
            
            # Get model data
            model_name = selected_names[p_idx]
            m_data = models_data[model_name]
            obs_size = m_data["obs_size"]
            model = m_data["model"]
            
            # Get correct observation
            if obs_size == 69:
                obs = get_obs_69(engine, p_idx)
            else:
                obs = get_obs_119(engine, p_idx)
            
            # Predict action
            action_idx, _ = model.predict(obs, deterministic=True)
            
            # Execute action in engine
            if engine.pending_steal:
                if action_idx == 2: engine.confirm_steal()
                else: engine.decline_steal()
            else:
                if action_idx == 0: engine.draw_card()
                else: engine.end_turn()

            if not engine.turn_started and not engine.is_game_over:
                engine.start_turn()

        # Record stats
        scores = [p.get_score() for p in engine.players]
        max_score = max(scores)
        winners = [i for i, s in enumerate(scores) if s == max_score]
        
        for i, name in enumerate(selected_names):
            score = scores[i]
            other_scores = [scores[j] for j in range(num_players) if i != j]
            avg_other = sum(other_scores) / len(other_scores) if other_scores else 0
            
            stats[name]["games"] += 1
            stats[name]["total_score"] += score
            stats[name]["total_diff"] += (score - avg_other)
            
            if i in winners:
                stats[name]["wins"] += 1

    # Write results
    output_file = "tournament_results.txt"
    sorted_stats = sorted(stats.items(), key=lambda x: (x[1]["wins"]/x[1]["games"] if x[1]["games"] > 0 else 0), reverse=True)
    
    with open(output_file, "w") as f:
        f.write(f"Tournament Results ({num_games} games, 3-5 players randomly pulled)\n")
        f.write("-" * 85 + "\n")
        f.write(f"{'Model Name':<25} | {'Games':<6} | {'Win Rate':<10} | {'Avg Score':<10} | {'Avg Diff':<10}\n")
        f.write("-" * 85 + "\n")
        for name, data in sorted_stats:
            games = data["games"]
            win_rate = (data["wins"] / games) * 100 if games > 0 else 0
            avg_score = data["total_score"] / games if games > 0 else 0
            avg_diff = data["total_diff"] / games if games > 0 else 0
            f.write(f"{name:<25} | {games:<6} | {win_rate:>8.2f}% | {avg_score:>9.2f} | {avg_diff:>9.2f}\n")
    
    print(f"Tournament results written to {output_file}")

if __name__ == "__main__":
    run_tournament()
