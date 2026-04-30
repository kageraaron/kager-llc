import torch
import json
from stable_baselines3 import PPO

def export_ppo_to_json(model_path, json_path):
    # Load model
    model = PPO.load(model_path)
    policy = model.policy.mlp_extractor.policy_net
    action_net = model.policy.action_net
    
    # Extract weights and biases
    # Linear 1
    w1 = policy[0].weight.data.cpu().numpy().T.flatten().tolist()
    b1 = policy[0].bias.data.cpu().numpy().flatten().tolist()
    
    # Linear 2 (Action Net in SB3 MlpPolicy)
    w2 = action_net.weight.data.cpu().numpy().T.flatten().tolist()
    b2 = action_net.bias.data.cpu().numpy().flatten().tolist()
    
    # Flatten as a single list [w1..., b1..., w2..., b2...]
    all_weights = w1 + b1 + w2 + b2
    
    # Wrap for trainedModel.ts format: export const TRAINED_WEIGHTS = [...]
    ts_content = f"export const TRAINED_WEIGHTS = {json.dumps(all_weights)};"
    
    with open(json_path, 'w') as f:
        f.write(ts_content)
    
    print(f"Exported {len(all_weights)} weights to {json_path}")

if __name__ == "__main__":
    export_ppo_to_json("./model_gen_9", "./rl_trainer/trainedModel_1.ts")
