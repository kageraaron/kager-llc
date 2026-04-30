import os
import random
import numpy as np
import gymnasium as gym
import json
from collections import deque
import copy
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from environment import FruitFightEnv
from agents import ConservativeBot, AggressiveBot, MathBot, NeuralBot, ScoreCardBot, ScoreBot, BustProbBot

def get_random_heuristics():
    return [
        ConservativeBot(),
        AggressiveBot(),
        MathBot(),
        ScoreCardBot(),
        ScoreBot(20, 10),
        BustProbBot(0.20),
        BustProbBot(0.40)
    ]

def export_to_json(model, json_path, ts_path=None):
    """Saves model weights to JSON and optionally TS format dynamically for any MLP architecture."""
    all_weights = []
    
    # Extract weights from MLP extractor and Action net (PPO/A2C/DQN structures)
    # The policy network components are in model.policy.mlp_extractor and model.policy.action_net
    # Flatten everything into a single list
    
    layers = []
    if hasattr(model.policy, "mlp_extractor"):
        layers.extend(model.policy.mlp_extractor.policy_net)
        layers.extend(model.policy.mlp_extractor.value_net)
    layers.append(model.policy.action_net)
    
    for layer in layers:
        if hasattr(layer, "weight"):
            all_weights.extend(layer.weight.data.cpu().numpy().T.flatten().tolist())
        if hasattr(layer, "bias") and layer.bias is not None:
            all_weights.extend(layer.bias.data.cpu().numpy().flatten().tolist())
    
    # Save as pure JSON for best_weights.json
    with open(json_path, 'w') as f:
        json.dump(all_weights, f)
    
    # Save as TS for trainedModel.ts
    if ts_path:
        ts_content = f"export const TRAINED_WEIGHTS = {json.dumps(all_weights)};"
        with open(ts_path, 'w') as f:
            f.write(ts_content)

class SelfPlayCallback(BaseCallback):
    def __init__(self, check_freq: int, save_path: str, env: FruitFightEnv, verbose=1):
        super(SelfPlayCallback, self).__init__(verbose)
        self.check_freq = check_freq
        self.save_path = save_path
        self.env = env
        self.generation = 0
        self.history = deque(maxlen=5) # Last 5 checkpoints

    def _on_step(self) -> bool:
        if self.n_calls % self.check_freq == 0:
            self.generation += 1
            
            # Log metrics
            history = list(self.env.episode_history)
            if history:
                win_rate = sum(e["win"] for e in history) / len(history)
                avg_score = sum(e["score"] for e in history) / len(history)
                self.logger.record("train/win_rate", win_rate)
                self.logger.record("train/avg_score", avg_score)
                print(f"Gen {self.generation} | Win Rate: {win_rate:.2f} | Avg Score: {avg_score:.2f}")

            import time
            timestamp = int(time.time())
            gen_name = f"model_gen_{self.generation}_{timestamp}"
            model_path = os.path.join(self.save_path, f"{gen_name}.zip")
            self.model.save(model_path)
            
            # Save checkpoint for history (store the path to the model instead of the object)
            self.history.append(model_path)
            
            # Export weights
            export_to_json(self.model, f"best_weights_{timestamp}.json", f"trainedModel_{timestamp}.ts")
            
            # Dynamic opponent selection
            new_opponents = []
            for _ in range(3):
                choice = random.random()
                if choice < 0.5 and self.history:
                    # Play against older model
                    path = random.choice(self.history)
                    new_opponents.append(NeuralBot(path))
                elif choice < 0.75:
                    # Play against self
                    new_opponents.append(NeuralBot(self.model))
                else:
                    # Heuristics
                    new_opponents.append(random.choice(get_random_heuristics()))
            
            self.env.opponents = new_opponents
            
        return True

def train():
    os.makedirs("rl_trainer/checkpoints", exist_ok=True)
    
    # Phase 1: Training against Heuristic Bots
    print("Starting Phase 1: Heuristic Bootcamp (100k steps)")
    
    bootcamp_opponents = get_random_heuristics()
    env = FruitFightEnv(opponents=bootcamp_opponents)
    
    model = PPO("MlpPolicy", env, verbose=1, 
                learning_rate=3e-4, 
                n_steps=2048, 
                batch_size=64, 
                n_epochs=10, 
                gamma=0.99,
                policy_kwargs=dict(net_arch=[128, 64]))
    
    import time
    timestamp = int(time.time())
    model.learn(total_timesteps=300000)
    model.save(f"rl_trainer/checkpoints/phase1_model_{timestamp}")
    export_to_json(model, "best_weights.json", "trainedModel.ts")
    print("Phase 1 Complete. Weights exported.")
    
    # Phase 2: Self-Play
    print("\nStarting Phase 2: Self-Play Curriculum (200k steps)")
    # Transition to self-play
    env.opponents = [NeuralBot(model), NeuralBot(model), NeuralBot(model)]
    
    # We use a smaller check_freq (e.g., 5000 steps) to save more "generations"
    callback = SelfPlayCallback(check_freq=5000, save_path="rl_trainer/checkpoints", env=env)
    
    model.learn(total_timesteps=400000, callback=callback, reset_num_timesteps=False)
    
    timestamp = int(time.time())
    model.save(f"rl_trainer/checkpoints/final_model_{timestamp}")
    export_to_json(model, "best_weights.json", "trainedModel.ts")
    print("Training Finished!")

if __name__ == "__main__":
    train()
