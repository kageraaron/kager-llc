from stable_baselines3 import PPO
import os
import glob

checkpoint_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "checkpoints")
checkpoints = glob.glob(os.path.join(checkpoint_dir, "*.zip"))

print(f"Found {len(checkpoints)} models.")

for cp in checkpoints:
    try:
        model = PPO.load(cp)
        print(f"{os.path.basename(cp)}: Obs {model.observation_space.shape[0]}, Actions {model.action_space}")
    except Exception as e:
        print(f"{os.path.basename(cp)}: Error {e}")
