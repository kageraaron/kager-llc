from stable_baselines3 import PPO
import os

checkpoint_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "checkpoints")
model_path = os.path.join(checkpoint_dir, "final_model.zip")
if not os.path.exists(model_path):
    # Try the other location
    checkpoint_dir = "../checkpoints"
    model_path = os.path.join(checkpoint_dir, "final_model.zip")

model = PPO.load(model_path)
print(f"Observation Space: {model.observation_space}")
print(f"Action Space: {model.action_space}")
