import numpy as np
from environment import FruitFightEnv

def test_environment_dimensions():
    env = FruitFightEnv()
    obs = env.reset()[0]
    
    assert obs.shape == (119,), f"Expected observation shape (119,), got {obs.shape}"
    assert env.action_space.n == 4, f"Expected action space 4, got {env.action_space.n}"
    
    print("Environment test passed: Observation and Action space dimensions are correct.")

if __name__ == "__main__":
    test_environment_dimensions()
