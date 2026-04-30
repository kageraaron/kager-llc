#!/usr/bin/env python3
"""
Semantic Sudoku Board Generator — fully offline, zero API calls
===============================================================
Uses a hand-crafted semantic graph (word → set of centers it evokes)
plus numpy/scipy for scoring and diversity checks.

Board layout (indices 0-8):
  [0:TL] [1:T ] [2:TR]
  [3:L ] [4:C ] [5:R ]
  [6:BL] [7:B ] [8:BR]

Four equations must ALL equal center [4]:
  Diagonal 1 : [0] + [8] = [4]   (TL + BR)
  Diagonal 2 : [2] + [6] = [4]   (TR + BL)
  Vertical   : [1] + [7] = [4]   (T  + B )
  Horizontal : [3] + [5] = [4]   (L  + R )

Usage:
  python semantic_sudoku_generator.py
  python semantic_sudoku_generator.py --seed fire
  python semantic_sudoku_generator.py --boards 12 --output puzzles.json
  python semantic_sudoku_generator.py --list-centers
"""

import argparse
import json
import math
import random
import sys
from collections import defaultdict
from itertools import combinations, permutations
from pathlib import Path
from typing import Optional

import numpy as np
from scipy.spatial.distance import cosine as cosine_dist

# ══════════════════════════════════════════════════════════════════
#  SEMANTIC GRAPH
#  Format:  CENTERS dict maps center_word → list of (word, strength)
#  strength: 3 = iconic/strong,  2 = solid,  1 = lateral/clever
#
#  Design rule: every word must reach the center from a different
#  conceptual angle. Words are grouped in comments by their "path".
# ══════════════════════════════════════════════════════════════════

CENTERS: dict[str, list[tuple[str, int]]] = {

    "fire": [
        # combustion / physics
        ("flame",    3), ("ash",      3), ("ember",    3), ("smoke",    3),
        ("spark",    3), ("heat",     2), ("burn",     3), ("char",     2),
        # destruction / danger
        ("destroy",  2), ("ruin",     2), ("disaster", 2), ("alarm",    2),
        # light / warmth / life
        ("torch",    3), ("candle",   3), ("hearth",   3), ("beacon",   2),
        # passion / emotion
        ("passion",  2), ("anger",    2), ("fury",     2), ("desire",   2),
        # dismissal (you're fired)
        ("dismiss",  2), ("resign",   1), ("layoff",   2),
        # cooking
        ("grill",    2), ("roast",    2), ("forge",    2),
    ],

    "shadow": [
        # light/dark physics
        ("darkness", 3), ("shade",    3), ("eclipse",  3), ("silhouette",3),
        ("dim",      2), ("dusk",     2), ("night",    2), ("veil",     2),
        # stealth / concealment
        ("spy",      2), ("hide",     2), ("lurk",     2), ("cloak",    2),
        ("ghost",    2), ("phantom",  2), ("trace",    2),
        # doubt / negativity
        ("doubt",    2), ("suspicion",2), ("threat",   2), ("gloom",    2),
        # following
        ("follow",   2), ("trail",    2), ("mimic",    2),
    ],

    "anchor": [
        # nautical
        ("ship",     3), ("harbor",   3), ("dock",     3), ("chain",    2),
        ("sea",      2), ("sailor",   2), ("vessel",   2),
        # stability / weight
        ("stable",   2), ("heavy",    2), ("ground",   2), ("foundation",3),
        ("hold",     2), ("fix",      2),
        # news / media (anchor = news anchor)
        ("broadcast",2), ("reporter", 2), ("studio",   2), ("camera",   2),
        # constraint
        ("burden",   2), ("drag",     2), ("trap",     2),
    ],

    "bridge": [
        # architecture / physical
        ("arch",     3), ("span",     3), ("river",    3), ("tower",    2),
        ("crossing", 3), ("cable",    2), ("steel",    2),
        # connection / mediation
        ("connect",  3), ("link",     3), ("gap",      3), ("divide",   2),
        ("negotiate",2), ("treaty",   2), ("diplomat", 2),
        # card game
        ("trump",    2), ("suit",     2), ("deal",     2), ("bid",      2),
        # music
        ("chorus",   2), ("verse",    2), ("melody",   2),
        # sub-centers
        ("gate",     2), ("anchor",   2), ("chain",    2),
    ],

    "crown": [
        # royalty / power
        ("king",     3), ("queen",    3), ("throne",   3), ("reign",    3),
        ("scepter",  3), ("royal",    2), ("noble",    2), ("empire",   2),
        # achievement / top
        ("trophy",   2), ("champion", 2), ("victor",   2), ("summit",   2),
        ("glory",    2), ("triumph",  2),
        # anatomy
        ("tooth",    2), ("head",     2), ("skull",    2),
        # botany
        ("tree",     2), ("canopy",   2), ("bloom",    2),
    ],

    "pressure": [
        # physics / force
        ("weight",   3), ("force",    3), ("compress", 3), ("crush",    2),
        ("squeeze",  2), ("steam",    2), ("valve",    2), ("gauge",    2),
        # stress / emotion
        ("stress",   3), ("anxiety",  3), ("burden",   2), ("demand",   2),
        ("tension",  2), ("deadline", 2), ("urgent",   2),
        # persuasion
        ("coerce",   2), ("bully",    2), ("push",     2), ("lobby",    2),
        # blood pressure / health
        ("pulse",    2), ("heart",    2), ("vein",     2),
        # atmosphere
        ("weather",  2), ("altitude", 2), ("depth",    2),
    ],

    "echo": [
        # sound / acoustics
        ("sound",    3), ("cave",     3), ("valley",   2), ("reverb",   3),
        ("bounce",   2), ("repeat",   2), ("ring",     2), ("resonate", 2),
        # mythology
        ("nymph",    2), ("narcissus",2), ("myth",     2),
        # repetition / imitation
        ("mimic",    2), ("copy",     2), ("reflect",  2), ("mirror",   2),
        # memory / past
        ("memory",   2), ("ghost",    2), ("trace",    1), ("remnant",  2),
        # tech (Amazon Echo)
        ("device",   1), ("speaker",  2), ("voice",    2),
    ],

    "gate": [
        # physical structure
        ("fence",    3), ("wall",     3), ("door",     2), ("lock",     2),
        ("keystone", 2), ("arch",     2), ("barrier",  2),
        # access / entry
        ("entry",    3), ("exit",     2), ("pass",     2), ("border",   2),
        ("ticket",   2), ("checkpoint",2),
        # scandal (-gate suffix)
        ("scandal",  2), ("cover",    2), ("expose",   2), ("corrupt",  2),
        # electronics (logic gate)
        ("circuit",  2), ("logic",    2), ("binary",   2), ("switch",   2),
        # airport
        ("flight",   2), ("board",    2), ("depart",   2),
        # sub-centers
        ("bridge",   2), ("vault",    2), ("hide",     2),
    ],

    "root": [
        # botany / plants
        ("soil",     3), ("tree",     3), ("plant",    3), ("grow",     2),
        ("stem",     2), ("earth",    2), ("dig",      2), ("bulb",     2),
        # origin / heritage
        ("origin",   3), ("ancestor", 3), ("heritage", 2), ("culture",  2),
        ("homeland", 2), ("tradition",2),
        # math
        ("square",   2), ("radical",  2), ("equation", 1),
        # cause / foundation
        ("source",   2), ("cause",    2), ("basis",    2), ("core",     2),
        # teeth / dentistry
        ("canal",    2), ("tooth",    2), ("nerve",    2),
    ],

    "flood": [
        # water / weather
        ("rain",     3), ("river",    3), ("dam",      3), ("surge",    3),
        ("overflow", 3), ("deluge",   3), ("torrent",  2),
        # disaster
        ("escape",   2), ("refuge",   2), ("ruin",     2), ("rescue",   2),
        # overwhelming quantity
        ("swamp",    2), ("overwhelm",2), ("saturate", 2), ("drown",    2),
        # light (flood light)
        ("light",    2), ("beam",     2), ("stage",    2), ("bright",   2),
        # biblical
        ("ark",      3), ("Noah",     2), ("raven",    2),
    ],

    "ghost": [
        # supernatural
        ("spirit",   3), ("haunt",    3), ("specter",  3), ("soul",     2),
        ("apparition",3),("phantom",  2), ("undead",   2),
        # fear / horror
        ("scare",    2), ("pale",     2), ("chill",    2), ("dread",    2),
        # disappearance
        ("vanish",   2), ("fade",     2), ("absent",   2), ("silent",   2),
        # technology (ghost in machine)
        ("machine",  1), ("data",     1), ("memory",   2),
        # pop culture
        ("sheet",    2), ("Halloween",2), ("trick",    1),
    ],

    "mirror": [
        # optics / reflection
        ("reflect",  3), ("glass",    3), ("image",    3), ("surface",  2),
        ("lens",     2), ("light",    2),
        # identity / self
        ("self",     2), ("vanity",   3), ("narcissus",2), ("ego",      2),
        # imitation / reversal
        ("copy",     2), ("reverse",  2), ("flip",     2), ("twin",     2),
        # truth / illusion
        ("truth",    2), ("illusion", 2), ("mask",     2), ("reveal",   2),
        # fairy tale (Snow White)
        ("queen",    2), ("fairest",  2), ("magic",    2),
    ],

    "storm": [
        # weather
        ("thunder",  3), ("lightning",3), ("rain",     2), ("wind",     3),
        ("hail",     2), ("cloud",    2), ("gale",     2), ("cyclone",  2),
        # conflict / chaos
        ("battle",   2), ("rage",     2), ("chaos",    2), ("fury",     2),
        ("outrage",  2), ("protest",  2), ("upheaval", 2),
        # military (storm the castle)
        ("assault",  2), ("invade",   2), ("siege",    2), ("charge",   2),
        # brain (brainstorm)
        ("idea",     2), ("creative", 2), ("inspire",  2),
    ],

    "chain": [
        # physical links
        ("link",     3), ("metal",    2), ("lock",     2), ("fence",    2),
        ("hook",     2), ("connect",  2), ("bind",     2),
        # constraint / captivity
        ("prison",   2), ("slave",    2), ("captive",  2), ("bound",    2),
        # sequence / logic
        ("sequence", 2), ("series",   2), ("reaction", 2), ("domino",   3),
        # supply chain / business
        ("supply",   2), ("retail",   2), ("store",    2), ("franchise",2),
        # food chain / biology
        ("predator", 2), ("prey",     2), ("ecosystem",2),
    ],

    "spark": [
        # fire / electricity
        ("ignite",   3), ("flame",    2), ("electric", 3), ("plug",     3),
        ("static",   2), ("wire",     2), ("voltage",  2),
        # inspiration / creativity
        ("inspire",  3), ("idea",     3), ("genius",   2), ("creative", 2),
        # romance
        ("romance",  2), ("attraction",2),("chemistry",2), ("flirt",    2),
        # beginning
        ("start",    2), ("trigger",  2), ("catalyst", 2), ("origin",   2),
    ],

    "vault": [
        # architecture / structure
        ("arch",     3), ("ceiling",  2), ("dome",     2), ("column",   2),
        # security / storage
        ("safe",     3), ("bank",     3), ("lock",     2), ("steel",    2),
        ("treasure", 2), ("secret",   2),
        # athletics (pole vault)
        ("jump",     3), ("pole",     3), ("leap",     2), ("athlete",  2),
        # death / burial
        ("tomb",     2), ("crypt",    2), ("bury",     2), ("coffin",   2),
    ],

    "veil": [
        # fabric / covering
        ("fabric",   2), ("curtain",  2), ("cover",    2), ("sheet",    2),
        # secrecy / concealment
        ("hide",     2), ("secret",   2), ("mystery",  2), ("mask",     2),
        # marriage / ritual
        ("bride",    3), ("wedding",  3), ("ceremony", 2), ("altar",    2),
        # religion / spirituality
        ("nun",      2), ("sacred",   2), ("divine",   2), ("ritual",   2),
        # metaphor (veil of tears, beyond the veil)
        ("death",    2), ("mystery",  2), ("illusion", 2),
        # sub-centers
        ("wedding",  2), ("death",    2), ("hide",     2), ("mask",     2),
    ],

    "wedding": [
        ("bride",    3), ("groom",    3), ("cake",     2), ("ring",     3),
        ("veil",     3), ("church",   2), ("vow",      3), ("altar",    2),
        ("ceremony", 3), ("party",    2), ("celebrate",2), ("toast",    2),
        ("dress",    2), ("suit",     2), ("flower",   2), ("love",     2),
        ("secret",   2), ("cover",    1), ("passion",  1), ("spark",    1),
    ],

    "death": [
        ("grave",    3), ("tomb",     3), ("coffin",   3), ("bury",     3),
        ("ghost",    3), ("spirit",   2), ("soul",     2), ("end",      2),
        ("funeral",  3), ("mourn",    3), ("skull",    2), ("skeleton", 2),
        ("vault",    2), ("crypt",    2), ("veil",     1), ("shadow",   1),
        ("bride",    1), ("illusion", 1),
    ],

    "hide": [
        ("secret",   3), ("mask",     2), ("cover",    3), ("cloak",    3),
        ("veil",     2), ("shadow",   2), ("spy",      2), ("lurk",     2),
        ("trap",     2), ("gate",     1), ("vault",    1), ("bride",    1),
    ],

    "mask": [
        ("face",     3), ("hide",     3), ("secret",   2), ("disguise", 3),
        ("costume",  2), ("veil",     2), ("mirror",   2), ("identity", 2),
        ("theater",  2), ("actor",    2), ("fake",     2), ("cover",    2),
        ("illusion", 2), ("reveal",   1),
    ],

    "wave": [
        # ocean / water
        ("ocean",    3), ("surf",     3), ("tide",     3), ("shore",    2),
        ("crest",    2), ("swell",    2), ("beach",    2),
        # physics / signal
        ("frequency",3), ("sound",    2), ("light",    2), ("radio",    2),
        ("vibration",2), ("signal",   2),
        # gesture
        ("greet",    2), ("farewell", 2), ("hand",     2), ("salute",   2),
        # mass movement
        ("trend",    2), ("surge",    2), ("mob",      2),
    ],

    "needle": [
        # sewing / craft
        ("thread",   3), ("sew",      3), ("fabric",   2), ("stitch",   2),
        ("thimble",  2), ("tailor",   2),
        # medicine / injection
        ("inject",   3), ("syringe",  3), ("vaccine",  2), ("vein",     2),
        ("blood",    2), ("hospital", 2),
        # sharp / precision
        ("sharp",    2), ("point",    2), ("pierce",   2), ("precise",  2),
        # compass needle
        ("compass",  3), ("north",    2), ("navigate", 2), ("direction",2),
        # haystack idiom
        ("search",   2), ("find",     2), ("rare",     2),
    ],

    "lens": [
        # optics / light
        ("glass",    2), ("focus",    3), ("light",    2), ("refract",  3),
        ("magnify",  3), ("clear",    2), ("optical",  2),
        # camera / photography
        ("camera",   3), ("photo",    2), ("zoom",     2), ("frame",    2),
        ("aperture", 2), ("capture",  2),
        # eye / vision
        ("eye",      3), ("cornea",   2), ("sight",    2), ("vision",   2),
        # perspective / analysis
        ("view",     2), ("angle",    2), ("bias",     2), ("context",  2),
    ],

    "current": [
        # electricity
        ("voltage",  3), ("circuit",  3), ("wire",     2), ("charge",   2),
        ("battery",  2), ("conductor",2),
        # water / ocean
        ("flow",     3), ("stream",   3), ("tide",     2), ("drift",    2),
        ("river",    2), ("eddy",     2),
        # time / news
        ("present",  2), ("today",    2), ("modern",   2), ("trend",    2),
        ("latest",   2), ("news",     2),
    ],

    "key": [
        # locks / doors
        ("lock",     3), ("door",     3), ("open",     2), ("access",   2),
        ("entry",    2), ("escape",   2),
        # music
        ("note",     2), ("chord",    3), ("scale",    3), ("piano",    3),
        ("tone",     2), ("harmony",  2),
        # importance / essential
        ("crucial",  2), ("vital",    2), ("critical", 2), ("core",     2),
        # computer
        ("keyboard", 3), ("press",    2), ("type",     2),
        # cryptography
        ("cipher",   2), ("decode",   2), ("encrypt",  2),
    ],

    "balance": [
        # physics / weight
        ("scale",    3), ("weight",   2), ("tilt",     2), ("level",    2),
        ("stable",   2), ("center",   2),
        # finance / accounting
        ("debt",     2), ("credit",   2), ("account",  2), ("budget",   2),
        ("ledger",   2), ("audit",    2),
        # justice
        ("justice",  3), ("court",    2), ("judge",    2), ("fair",     2),
        ("equal",    2), ("rights",   2),
        # wellness / yoga
        ("yoga",     2), ("posture",  2), ("harmony",  2), ("calm",     2),
    ],

    "trap": [
        # hunting / capture
        ("cage",     3), ("snare",    3), ("bait",     3), ("lure",     2),
        ("hunter",   2), ("prey",     2),
        # deception
        ("trick",    2), ("deceive",  2), ("ambush",   2), ("scheme",   2),
        ("plot",     2), ("betray",   2),
        # confined / stuck
        ("prison",   2), ("escape",   2), ("stuck",    2), ("web",      2),
        # music (trap music)
        ("beat",     2), ("bass",     2), ("rhythm",   2), ("rapper",   1),
        # drums
        ("snare",    2), ("drum",     2), ("percussion",1),
    ],

    "forge": [
        # metalworking / craft
        ("metal",    3), ("anvil",    3), ("hammer",   3), ("heat",     2),
        ("iron",     2), ("steel",    2), ("smith",    3),
        # creation / building
        ("create",   2), ("build",    2), ("craft",    2), ("shape",    2),
        # deception / fake
        ("fake",     3), ("counterfeit",3),("copy",    2), ("fraud",    2),
        ("sign",     2), ("document", 2),
        # alliance / relationship
        ("bond",     2), ("alliance", 2), ("unite",    2), ("treaty",   2),
    ],

    "spiral": [
        # shape / geometry
        ("curve",    2), ("coil",     3), ("helix",    3), ("spin",     2),
        ("rotate",   2), ("swirl",    2), ("twist",    2),
        # decline / worsening
        ("decline",  2), ("collapse", 2), ("crisis",   2), ("downfall", 2),
        ("worse",    2), ("chaos",    2),
        # galaxy / cosmos
        ("galaxy",   3), ("nebula",   2), ("cosmos",   2), ("orbit",    2),
        # shell / nature
        ("shell",    2), ("snail",    2), ("fern",     2), ("nature",   2),
    ],

    "feast": [
        # food / celebration
        ("banquet",  3), ("dinner",   2), ("table",    2), ("plenty",   2),
        ("abundance",2), ("spread",   2), ("meal",     2),
        # religion / ritual
        ("fast",     2), ("prayer",   2), ("holiday",  2), ("sacred",   2),
        ("church",   2), ("ritual",   2),
        # senses / indulgence
        ("eye",      2), ("indulge",  2), ("luxury",   2), ("pleasure", 2),
        # royalty / medieval
        ("king",     2), ("castle",   2), ("hall",     2), ("mead",     2),
    ],

    "seed": [
        # botany / growth
        ("plant",    3), ("soil",     2), ("grow",     2), ("flower",   2),
        ("fruit",    2), ("harvest",  2), ("sprout",   2),
        # origin / potential
        ("idea",     2), ("begin",    2), ("origin",   2), ("start",    2),
        ("embryo",   2), ("potential",2),
        # sports seeding
        ("rank",     2), ("bracket",  2), ("tournament",2),("compete",  1),
        # technology
        ("database", 1), ("random",   1), ("algorithm",1),
    ],

    "beacon": [
        # light / signal
        ("lighthouse",3),("flash",    2), ("signal",   3), ("light",    2),
        ("tower",    2), ("lamp",     2), ("warn",     2),
        # navigation / direction
        ("guide",    3), ("navigate", 2), ("north",    2), ("compass",  2),
        ("direction",2), ("landmark", 2),
        # hope / inspiration
        ("hope",     3), ("symbol",   2), ("inspire",  2), ("rally",    2),
        ("hero",     2), ("example",  2),
    ],

    "thread": [
        # sewing / craft
        ("needle",   3), ("fabric",   3), ("weave",    2), ("stitch",   2),
        ("sew",      2), ("loom",     2), ("cloth",    2),
        # connection / narrative
        ("story",    2), ("plot",     2), ("follow",   2), ("connect",  2),
        ("link",     2), ("trace",    2),
        # internet / social media
        ("post",     2), ("reply",    2), ("forum",    2), ("comment",  2),
        # screws / bolts
        ("bolt",     2), ("screw",    2), ("grip",     2), ("twist",    2),
    ],

    "pulse": [
        # heart / biology
        ("heart",    3), ("beat",     3), ("artery",   2), ("blood",    2),
        ("vital",    2), ("alive",    2), ("rhythm",   2),
        # music / rhythm
        ("tempo",    2), ("drum",     2), ("bass",     2), ("groove",   2),
        # electricity / signal
        ("signal",   2), ("wave",     2), ("frequency",2), ("current",  2),
        # energy / city life
        ("city",     2), ("energy",   2), ("vibrant",  2), ("rush",     2),
    ],

    "venom": [
        # snakes / creatures
        ("snake",    3), ("bite",     3), ("fang",     3), ("spider",   2),
        ("scorpion", 2), ("cobra",    2), ("toxic",    2),
        # poison
        ("poison",   3), ("toxic",    2), ("lethal",   2), ("antidote", 2),
        # hatred / cruelty
        ("hate",     2), ("spite",    2), ("bitter",   2), ("cruel",    2),
        ("malice",   2), ("sharp",    1),
        # medicine
        ("cure",     2), ("dose",     2), ("extract",  2),
    ],

    "quarry": [
        # mining / extraction
        ("stone",    3), ("mine",     3), ("excavate", 2), ("rock",     2),
        ("blast",    2), ("marble",   2), ("limestone",2),
        # hunting target
        ("prey",     3), ("hunt",     3), ("chase",    2), ("pursue",   2),
        ("target",   2), ("escape",   2),
        # birds (quarrel)
        ("hawk",     1), ("falcon",   1), ("eagle",    1),
    ],

    "tide": [
        # ocean / moon
        ("moon",     3), ("ocean",    3), ("shore",    2), ("ebb",      3),
        ("flow",     2), ("wave",     2), ("lunar",    2),
        # change / cycles
        ("shift",    2), ("cycle",    2), ("turn",     2), ("change",   2),
        ("fortune",  2), ("fate",     2),
        # opinion / politics
        ("opinion",  2), ("war",      2), ("politics", 2), ("sentiment",2),
    ],

    "stroke": [
        # sport (tennis, golf, swimming)
        ("tennis",   3), ("golf",     2), ("swim",     3), ("row",      2),
        ("paddle",   2), ("racket",   2),
        # medical / brain
        ("brain",    3), ("heart",    2), ("clot",     2), ("vessel",   2),
        ("paralysis",3), ("attack",   2),
        # art / painting
        ("paint",    3), ("brush",    3), ("canvas",   2), ("color",    2),
        # physical action / touch
        ("pet",      2), ("caress",   2), ("touch",    2), ("gentle",   2),
        # time / mechanics
        ("clock",    2), ("bell",     2), ("midnight", 1), ("hour",     1),
    ],

    "bank": [
        # finance
        ("money",    3), ("cash",     3), ("account",  2), ("loan",     2),
        ("deposit",  3), ("vault",    2), ("teller",   2),
        # geography (river bank)
        ("river",    3), ("shore",    2), ("edge",     2), ("water",    2),
        ("slope",    2), ("erosion",  1),
        # storage / supply
        ("blood",    2), ("data",     2), ("seed",     2), ("memory",   1),
        # gambling
        ("casino",   2), ("bet",      1), ("dealer",   1),
    ],

    "club": [
        # social / organization
        ("member",   3), ("group",    2), ("society",  2), ("meeting",  2),
        # nightlife
        ("dance",    3), ("music",    2), ("disco",    2), ("party",    2),
        # weapon
        ("bat",      3), ("blunt",    2), ("hit",      2), ("weapon",   2),
        # cards
        ("suit",     3), ("spade",    2), ("heart",    2), ("diamond",  2),
        ("deck",     2),
        # golf
        ("golf",     3), ("putt",     2), ("swing",    2), ("iron",     1),
    ],

    "net": [
        # tool / fishing
        ("fish",     3), ("catch",    3), ("mesh",     3), ("trap",     2),
        # sports
        ("tennis",   3), ("goal",     3), ("soccer",   2), ("court",    2),
        # technology
        ("internet", 3), ("web",      3), ("network",  2), ("data",     2),
        # finance (net profit)
        ("profit",   2), ("gross",    2), ("income",   2), ("tax",      1),
    ],

    "scale": [
        # weight / measurement
        ("weight",   3), ("balance",  3), ("measure",  2), ("heavy",    2),
        # music
        ("note",     3), ("piano",    2), ("song",     2), ("tone",     2),
        # biology (fish scales)
        ("fish",     3), ("skin",     2), ("reptile",  2), ("armor",    1),
        # size / proportion
        ("large",    2), ("map",      2), ("model",    2), ("ratio",    2),
        # climbing
        ("climb",    2), ("mountain", 2), ("wall",     2),
    ],

    "sport": [
        ("game",     3), ("match",    3), ("play",     3), ("athlete",  3),
        ("team",     2), ("coach",    2), ("win",      2), ("lose",     2),
        ("tennis",   3), ("golf",     3), ("swim",     3), ("row",      2),
        ("ball",     2), ("racket",   2), ("club",     2), ("stroke",   2),
    ],

    "medicine": [
        ("doctor",   3), ("nurse",    3), ("hospital", 3), ("health",   3),
        ("cure",     3), ("drug",     2), ("patient",  2), ("surgery",  2),
        ("brain",    2), ("heart",    2), ("blood",    2), ("stroke",   2),
        ("pill",     2), ("dose",     2), ("vaccine",  2),
    ],

    "music": [
        ("sound",    3), ("song",     3), ("melody",   3), ("rhythm",   3),
        ("note",     3), ("scale",    3), ("chord",    3), ("beat",     2),
        ("instrument",3),("piano",    2), ("guitar",   2), ("drum",     2),
        ("concert",  2), ("band",     2), ("singer",   2), ("opera",    1),
    ],

    "body": [
        ("head",     3), ("hand",     3), ("foot",     3), ("face",     3),
        ("heart",    3), ("brain",    3), ("organ",    3), ("skin",     3),
        ("blood",    2), ("bone",     2), ("muscle",   2), ("nerve",    2),
        ("health",   2), ("medicine", 2), ("life",     2),
    ],

}


# ══════════════════════════════════════════════════════════════════
#  WORD → CENTERS INDEX  (inverted from CENTERS dict)
# ══════════════════════════════════════════════════════════════════

# word → {center: strength}
WORD_INDEX: dict[str, dict[str, float]] = defaultdict(dict)

def build_index():
    global WORD_INDEX
    WORD_INDEX.clear()
    for _center, _entries in CENTERS.items():
        for _word, _strength in _entries:
            w = _word.lower()
            c = _center.lower()
            WORD_INDEX[w][c] = max(WORD_INDEX[w].get(c, 0), _strength)

build_index()

def load_external_graph(file_path: str):
    """
    Merge an external JSON graph into the global CENTERS dict.
    Format expected: { "center": { "word": weight, ... }, ... }
    """
    print(f"Loading external graph: {file_path}")
    try:
        with open(file_path, "r") as f:
            ext_graph = json.load(f)
        count = 0
        for center, words in ext_graph.items():
            if center not in CENTERS:
                CENTERS[center] = []
            
            # Use a set to avoid duplicates within the list
            existing = {w.lower() for w, _ in CENTERS[center]}
            for word, weight in words.items():
                if word.lower() not in existing:
                    CENTERS[center].append((word, weight))
                    count += 1
        print(f"Merged {count} new semantic links into the graph.")
        build_index()
    except Exception as e:
        print(f"Error loading graph: {e}")

# ══════════════════════════════════════════════════════════════════
#  MORPHOLOGICAL DEDUPLICATION
# ══════════════════════════════════════════════════════════════════

_SUFFIXES = [
    "ations", "ation", "ments", "ment", "nesses", "ness",
    "ings", "ing", "tions", "tion", "ers", "ies",
    "est", "ful", "less", "ally", "ily", "ly", "al", "er",
    "ed", "es", "s",
]

# Manual mapping for tricky irregular roots that suffix-stripping misses
_ROOT_MAP = {
    "flight": "fli",
    "fly": "fli",
    "flew": "fli",
    "dinner": "din",
    "dining": "din",
    "dine": "din",
    "thought": "think",
    "think": "think",
    "caught": "catch",
    "catch": "catch",
    "bought": "buy",
    "buy": "buy",
    "seek": "sought",
    "sought": "sought",
    "bring": "brought",
    "brought": "brought",
}

def morph_root(word: str) -> str:
    w = word.lower()
    if w in _ROOT_MAP:
        return _ROOT_MAP[w]
        
    for sfx in _SUFFIXES:
        if w.endswith(sfx) and len(w) - len(sfx) >= 3:
            w = w[: len(w) - len(sfx)]
            break
    if w.endswith("e") and len(w) > 3:
        w = w[:-1]
    return w


def has_morph_overlap(words: list[str]) -> bool:
    """
    Check if any two words in the list share a root or prefix.
    """
    cleaned = [w.lower().strip() for w in words]
    roots = [morph_root(w) for w in cleaned]
    
    for i in range(len(roots)):
        for j in range(i + 1, len(roots)):
            w1, w2 = cleaned[i], cleaned[j]
            r1, r2 = roots[i], roots[j]
            
            # Direct root match
            if r1 == r2:
                return True
                
            # Cross-containment (one word contains the other)
            # Catching "fire" vs "fireplace", "wind" vs "windy"
            if len(w1) >= 4 and len(w2) >= 4:
                if w1 in w2 or w2 in w1:
                    return True
            
            # Shared prefix of ≥3 chars (Aggressive)
            # Catching "flow" vs "flood", "light" vs "lightning"
            # But only if the words are somewhat similar in length to avoid "cat" in "category"
            prefix_len = 0
            for c1, c2 in zip(w1, w2):
                if c1 == c2:
                    prefix_len += 1
                else:
                    break
            
            if prefix_len >= 4:
                return True
            if prefix_len >= 3 and (len(w1) < 6 or len(w2) < 6):
                # High risk of overlap for short words
                return True
                
    return False


# ══════════════════════════════════════════════════════════════════
#  PAIR STRENGTH  (both words → center)
# ══════════════════════════════════════════════════════════════════

def pair_strength(word_a: str, word_b: str, center: str) -> float:
    """
    Score a semantic pair (A, B → CENTER).
    Returns 0.0–10.0+.  Higher = stronger puzzle connection.
    Specifically rewards lateral connections (low semantic overlap).
    """
    if center not in CENTERS:
        return 0.0
    sa = WORD_INDEX.get(word_a.lower(), {}).get(center.lower(), 0)
    sb = WORD_INDEX.get(word_b.lower(), {}).get(center.lower(), 0)
    if sa == 0 or sb == 0:
        return 0.0
        
    # Geometric mean rewards both being strong; penalizes weak links
    geo = math.sqrt(sa * sb)
    
    # Bonus: words that hit DIFFERENT semantic angles
    # We look at the overlap of ALL centers these two words evoke.
    # If they only share the CURRENT center, they are conceptually distant.
    centers_a = set(WORD_INDEX.get(word_a.lower(), {}).keys())
    centers_b = set(WORD_INDEX.get(word_b.lower(), {}).keys())
    
    intersection = centers_a & centers_b
    union = centers_a | centers_b
    
    overlap_ratio = len(intersection) / max(len(union), 1)
    
    # Diversity bonus is much higher now to prioritize lateral thinking
    # If overlap is 0 (except for the current center), they get a massive boost.
    diversity_bonus = (1.0 - overlap_ratio) * 2.0
    
    # Heterogeneity bonus: if one is strength 1 or 2 and they are diverse, boost it.
    hetero_bonus = 0.0
    if (sa <= 2 or sb <= 2) and overlap_ratio < 0.1:
        hetero_bonus = 1.0
        
    return round(geo + diversity_bonus + hetero_bonus, 3)


# ══════════════════════════════════════════════════════════════════
#  BOARD SCORING
# ══════════════════════════════════════════════════════════════════

def corner_diversity_score(tl: str, tr: str, bl: str, br: str) -> float:
    """
    Corners should be conceptually distant from each other.
    Measure: average pairwise dissimilarity of their center-sets.
    """
    corners = [tl, tr, bl, br]
    # Build a binary vector for each word across all centers
    center_list = list(CENTERS.keys())
    n = len(center_list)

    def vec(word: str) -> np.ndarray:
        v = np.zeros(n)
        for i, c in enumerate(center_list):
            v[i] = WORD_INDEX.get(word.lower(), {}).get(c.lower(), 0)
        return v

    vecs = [vec(w) for w in corners]
    dists = []
    for i, j in combinations(range(4), 2):
        a, b = vecs[i], vecs[j]
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        if na > 0 and nb > 0:
            dists.append(cosine_dist(a, b))   # 0=identical, 1=orthogonal
        else:
            dists.append(1.0) # Maximum distance if one has no centers
    return round(float(np.mean(dists)) * 10, 2)   # scale to 0-10


def score_board(board: dict) -> dict:
    g = board["grid"]
    tl, t, tr, l, c, r, bl, b, br = g

    # 8 paths: Outer + Outer = Middle
    path_scores = {
        "top_horiz":    pair_strength(tl, tr, t),
        "mid_horiz":    pair_strength(l, r, c),
        "bot_horiz":    pair_strength(bl, br, b),
        "left_vert":    pair_strength(tl, bl, l),
        "mid_vert":     pair_strength(t, b, c),
        "right_vert":   pair_strength(tr, br, r),
        "diag_tl_br":   pair_strength(tl, br, c),
        "diag_tr_bl":   pair_strength(tr, bl, c),
    }

    weakest = min(path_scores.values())
    avg     = sum(path_scores.values()) / 8
    corner_div = corner_diversity_score(tl, tr, bl, br)

    # Lateral Thinking Score: rewards boards where corner diversity is high 
    # and paths are balanced but distinct.
    overall = round(
        0.4 * weakest +          # 40 % driven by weakest link
        0.2 * avg +              # 20 % average quality
        0.4 * (corner_div / 10) * 5,  # 40 % corner diversity (scaled to 5)
        2,
    )

    playable = weakest >= 1.5 and avg >= 2.0 and overall >= 2.0

    return {
        "path_scores": path_scores,
        "weakest_path": weakest,
        "average_path": round(avg, 2),
        "corner_diversity": corner_div,
        "overall": overall,
        "playable": playable,
    }


# ══════════════════════════════════════════════════════════════════
#  BOARD ASSEMBLY
# ══════════════════════════════════════════════════════════════════

def assemble_board(center_word: str, rng: random.Random, top_k: int = 80) -> Optional[dict]:
    """
    Find 5 centers (C, T, B, L, R) and 4 corners (TL, TR, BL, BR)
    that satisfy the 8 semantic magic square equations.
    Searches for the BEST board based on lateral thinking scores.
    """
    c = center_word
    if c not in CENTERS:
        return None
        
    center_keys = set(CENTERS.keys())
    
    # Potential T, B, L, R must evoke C AND be centers themselves
    candidates = [w for w, s in CENTERS[c] if w in center_keys]
    if len(candidates) < 4:
        return None
    
    # Mix of strong and lateral candidates to encourage variety
    cand_strengths = {w: s for w, s in CENTERS[c]}
    candidates.sort(key=lambda x: cand_strengths.get(x, 0), reverse=True)
    
    # Take a wider range of candidates to find more diverse grids
    candidates = candidates[:top_k]
    rng.shuffle(candidates)
    
    # Pre-calculate bridging words for each candidate pair
    # bridge[c1][c2] = words that evoke c1, c2, and the main center c
    words_in_c = set(w for w, s in CENTERS[c])
    sub_words = {sub: set(w for w, s in CENTERS[sub]) for sub in candidates}
    
    def get_bridges(c1, c2):
        return list(sub_words[c1] & sub_words[c2] & words_in_c)

    best_board = None
    best_overall = -1.0
    boards_found = 0
    max_boards_to_check = 50 # Don't search forever

    # Optimization: pre-calculate permutations of candidates to check
    cand_perms = list(permutations(candidates, 4))
    rng.shuffle(cand_perms)

    for t, b, l, r in cand_perms:
        if boards_found >= max_boards_to_check:
            break
            
        # Must satisfy constraints:
        # TL: T, L, C
        # TR: T, R, C
        # BL: B, L, C
        # BR: B, R, C
        
        tls = get_bridges(t, l)
        if not tls: continue
        trs = get_bridges(t, r)
        if not trs: continue
        bls = get_bridges(b, l)
        if not bls: continue
        brs = get_bridges(b, r)
        if not brs: continue
            
        # Try combinations of these words
        for tl in tls:
            for tr in trs:
                for bl in bls:
                    for br in brs:
                        grid = [tl, t, tr, l, c, r, bl, b, br]
                        if len(set(grid)) != 9:
                            continue
                        if has_morph_overlap(grid):
                            continue
                            
                        board = {
                            "grid": grid,
                            "center": c,
                            "pairs": {
                                "top_horiz": [tl, tr],
                                "mid_horiz": [l, r],
                                "bot_horiz": [bl, br],
                                "left_vert": [tl, bl],
                                "mid_vert":  [t, b],
                                "right_vert": [tr, br],
                                "diag_tl_br": [tl, br],
                                "diag_tr_bl": [tr, bl],
                            },
                        }
                        # Final scoring check
                        sc = score_board(board)
                        if sc["playable"]:
                            boards_found += 1
                            if sc["overall"] > best_overall:
                                best_overall = sc["overall"]
                                board["score"] = sc
                                best_board = board
                        
                        if boards_found >= max_boards_to_check:
                            return best_board
                            
    return best_board


# ══════════════════════════════════════════════════════════════════
#  MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════

def pick_diverse_centers(
    n: int,
    seed_word: str = "",
    rng: random.Random = None,
) -> list[str]:
    """
    Pick n centers that are semantically distant from each other.
    Prioritize centers with more words in their neighborhood.
    """
    rng = rng or random.Random()
    
    # Sort centers by richness (number of words)
    all_centers = sorted(list(CENTERS.keys()), key=lambda c: len(CENTERS[c]), reverse=True)
    if not all_centers:
        return []

    # Filter for centers that have at least some minimum number of words
    # to be viable for the magic square (which needs 5 centers and 4 corners)
    rich_centers = [c for c in all_centers if len(CENTERS[c]) >= 8]
    if len(rich_centers) < n:
        rich_centers = all_centers[:n*2]

    # If seed given, prefer centers that contain the seed word
    if seed_word:
        seed_lower = seed_word.lower()
        if seed_lower in CENTERS:
            starters = [seed_lower]
        else:
            starters = [
                c for c in rich_centers
                if any(seed_lower in w or w in seed_lower
                       for w, _ in CENTERS[c])
            ]
        if not starters:
            starters = rng.sample(rich_centers, min(1, len(rich_centers)))
    else:
        starters = rng.sample(rich_centers[:min(len(rich_centers), 500)], min(1, len(rich_centers)))

    # If the center list is huge, we'll work with the top-K richest ones
    candidate_pool = rich_centers[:2000]
    if starters[0] not in candidate_pool:
        candidate_pool.append(starters[0])

    # Word index for the pool
    all_words = sorted(list(set(w.lower() for c in candidate_pool for w, _ in CENTERS[c])))
    word_to_idx = {w: i for i, w in enumerate(all_words)}
    
    def get_vec(c: str) -> np.ndarray:
        v = np.zeros(len(all_words))
        for w, strength in CENTERS.get(c, []):
            if w.lower() in word_to_idx:
                v[word_to_idx[w.lower()]] = strength
        return v

    # Memoized vectors and distances
    vecs = {}
    def get_dist(c1, c2):
        if c1 not in vecs: vecs[c1] = get_vec(c1)
        if c2 not in vecs: vecs[c2] = get_vec(c2)
        v1, v2 = vecs[c1], vecs[c2]
        na, nb = np.linalg.norm(v1), np.linalg.norm(v2)
        return float(cosine_dist(v1, v2)) if na > 0 and nb > 0 else 1.0

    chosen = [starters[0]]
    remaining = [c for c in candidate_pool if c not in chosen]

    while len(chosen) < n and remaining:
        best, best_score = None, -1.0
        # Check a sample of the richest remaining ones
        check_pool = remaining[:200]
        
        for c in check_pool:
            min_dist = min(get_dist(c, ch) for ch in chosen)
            if min_dist > best_score:
                best_score = min_dist
                best = c
        if best:
            chosen.append(best)
            remaining.remove(best)
        else:
            break

    return chosen[:n]


def generate_boards(
    seed_word: str = "",
    target: int = 6,
    min_overall: float = 1.0,
    random_seed: Optional[int] = None,
    verbose: bool = True,
) -> list[dict]:

    rng = random.Random(random_seed)

    def vprint(*a):
        if verbose:
            print(*a, flush=True)

    vprint(f"\n{'═'*56}")
    vprint("  SEMANTIC SUDOKU — Offline Board Generator")
    vprint(f"{'═'*56}")
    vprint(f"  Seed word : {seed_word or '(none)'}")
    vprint(f"  Target    : {target} boards")
    vprint(f"  Min score : {min_overall}")
    vprint(f"{'═'*56}\n")

    n_centers_to_try = min(len(CENTERS), max(target * 20, 100))
    centers = pick_diverse_centers(n_centers_to_try, seed_word=seed_word, rng=rng)

    accepted: list[dict] = []

    for idx, center in enumerate(centers):
        if len(accepted) >= target:
            break

        vprint(f"▶  [{idx+1:02d}/{len(centers)}] center = \"{center.upper()}\"")

        # Try up to 5 random assemblies per center (different shuffles)
        board = None
        for attempt in range(5):
            board = assemble_board(center, rng=rng, top_k=50)
            if board:
                break

        if board is None:
            vprint(f"      ✗  could not assemble a valid board\n")
            continue

        sc = score_board(board)
        board["score"] = sc

        vprint(f"      grid    : {board['grid']}")
        vprint(f"      overall : {sc['overall']}  |  weakest path: {sc['weakest_path']}  |  playable: {sc['playable']}")

        if sc["overall"] >= min_overall and sc["playable"]:
            accepted.append(board)
            vprint(f"      ✓  accepted  ({len(accepted)}/{target})\n")
        else:
            vprint(f"      ✗  below quality threshold\n")

    vprint(f"\n{'═'*56}")
    vprint(f"  Finished.  {len(accepted)} board(s) accepted.")
    vprint(f"{'═'*56}\n")
    return accepted


# ══════════════════════════════════════════════════════════════════
#  DISPLAY
# ══════════════════════════════════════════════════════════════════

def print_board(board: dict, index: int = 1):
    g = board["grid"]
    sc = board.get("score", {})
    tl, t, tr, l, c, r, bl, b, br = g

    w = max(len(x) for x in g) + 2
    row = lambda a, b_, c_: f"  │ {a:^{w}} │ {b_:^{w}} │ {c_:^{w}} │"
    bar = "  ├" + ("─" * (w + 2) + "┼") * 2 + "─" * (w + 2) + "┤"
    top = "  ┌" + ("─" * (w + 2) + "┬") * 2 + "─" * (w + 2) + "┐"
    bot = "  └" + ("─" * (w + 2) + "┴") * 2 + "─" * (w + 2) + "┘"

    print(f"\n── Board #{index} {'─'*40}")
    print(f"  Center  : {c.upper()}")
    print(f"  Overall : {sc.get('overall','?')}  |  Corner diversity: {sc.get('corner_diversity','?')}/10  |  Playable: {sc.get('playable','?')}")
    print()
    print(top)
    print(row(tl, t, tr))
    print(bar)
    print(row(l, c.upper(), r))
    print(bar)
    print(row(bl, b, br))
    print(bot)
    print()
    paths = sc.get("path_scores", {})
    for label, key, words, center_word in [
        ("Horiz Top", "top_horiz",  [tl, tr], t),
        ("Horiz Mid", "mid_horiz",  [l, r],   c),
        ("Horiz Bot", "bot_horiz",  [bl, br], b),
        ("Vert Left", "left_vert",  [tl, bl], l),
        ("Vert Mid ", "mid_vert",   [t, b],   c),
        ("Vert Right", "right_vert", [tr, br], r),
        ("Diag TL-BR", "diag_tl_br", [tl, br], c),
        ("Diag TR-BL", "diag_tr_bl", [tr, bl], c),
    ]:
        ps = paths.get(key, "?")
        w_str = f"{words[0]:>12} + {words[1]:<12}"
        print(f"  {label:<12}:  {w_str} →  {center_word.upper():<12}  [{ps}]")
    print()


# ══════════════════════════════════════════════════════════════════
#  JSON SERIALISATION
# ══════════════════════════════════════════════════════════════════

def boards_to_json(boards: list[dict]) -> dict:
    out = []
    for b in boards:
        sc = b.get("score", {})
        out.append({
            "grid": b["grid"],
            "center": b["center"],
            "pairs": b.get("pairs", {}),
            "score": {
                "overall":          sc.get("overall"),
                "weakest_path":     sc.get("weakest_path"),
                "average_path":     sc.get("average_path"),
                "corner_diversity": sc.get("corner_diversity"),
                "playable":         sc.get("playable"),
                "path_scores":      sc.get("path_scores", {}),
            },
            "algorithm_params": {
                "method":               "semantic_magic_square_8_paths",
                "scoring":              "geometric_mean_pair_strength_weakest_link",
                "morph_dedup":          True,
                "uniqueness_check":     True,
                "min_overall_score":    1.5,
                "pair_diversity_bonus": True,
                "center_selection":     "max_cosine_distance",
            },
        })
    return {"boards": out, "total": len(out)}


# ══════════════════════════════════════════════════════════════════
#  CLI
# ══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Generate Semantic Sudoku boards — fully offline, no API.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--seed",       default="",    help="Optional theme seed word")
    parser.add_argument("--boards",     type=int, default=6, help="Target boards (default: 6)")
    parser.add_argument("--min-score",  type=float, default=1.0, help="Min overall score (default: 1.0)")
    parser.add_argument("--random-seed",type=int, default=None, help="RNG seed for reproducibility")
    parser.add_argument("--output",     default="semantic_sudoku_boards.json", help="Output JSON path")
    parser.add_argument("--append",     action="store_true", help="Append to output instead of overwriting")
    parser.add_argument("--graph",      default="semantic_graph_expanded.json", help="Path to expanded semantic graph JSON")
    parser.add_argument("--quiet",      action="store_true", help="Suppress verbose output")
    parser.add_argument("--list-centers", action="store_true", help="Print all available centers and exit")
    args = parser.parse_args()

    # Programmatic expansion: try to load expanded graph if it exists
    graph_path = Path(args.graph)
    if graph_path.exists():
        load_external_graph(str(graph_path))
    else:
        # Try local semantic_graph.json if expanded is missing
        alt_graph = Path("semantic_graph.json")
        if alt_graph.exists():
            load_external_graph(str(alt_graph))

    if args.list_centers:
        print("\nAvailable centers:")
        for i, c in enumerate(sorted(CENTERS.keys()), 1):
            n_words = len(CENTERS[c])
            print(f"  {i:3d}.  {c:<20}  ({n_words} words)")
        print()
        return

    boards = generate_boards(
        seed_word=args.seed,
        target=args.boards,
        min_overall=args.min_score,
        random_seed=args.random_seed,
        verbose=not args.quiet,
    )

    for i, board in enumerate(boards, 1):
        print_board(board, index=i)

    path = Path(args.output)
    
    # Append logic
    existing_boards = []
    if args.append and path.exists():
        try:
            old_data = json.loads(path.read_text())
            existing_boards = old_data.get("boards", [])
            print(f"Loaded {len(existing_boards)} existing boards for appending.")
        except Exception as e:
            print(f"Warning: Could not read existing boards from {path}: {e}")

    new_json_data = boards_to_json(boards)
    new_boards = new_json_data.get("boards", [])
    
    # Simple deduplication by grid (stringified)
    seen_grids = {json.dumps(b["grid"]) for b in existing_boards}
    added_count = 0
    for b in new_boards:
        grid_json = json.dumps(b["grid"])
        if grid_json not in seen_grids:
            existing_boards.append(b)
            seen_grids.add(grid_json)
            added_count += 1
    
    final_data = {
        "boards": existing_boards,
        "total": len(existing_boards)
    }

    path.write_text(json.dumps(final_data, indent=2))
    if args.append:
        print(f"✓  Added {added_count} unique board(s) to {path} (Total: {len(existing_boards)})")
    else:
        print(f"✓  Saved {len(new_boards)} board(s) to {path}")


if __name__ == "__main__":
    main()