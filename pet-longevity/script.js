
document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initCalculator();
});

/**
 * Navigation Logic
 */
function initNav() {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    const header = document.querySelector('#site-header');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            const isOpened = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', !isOpened);
            navLinks.classList.toggle('nav-open');
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navToggle.setAttribute('aria-expanded', 'false');
                navLinks.classList.remove('nav-open');
            });
        });
    }

    // Scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

/**
 * Calculator Logic
 */
function initCalculator() {
    const form = document.getElementById('calc-form');
    const results = document.getElementById('calc-results');

    if (!form || !results) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const data = new FormData(form);
        const species = data.get('species');
        let weight = parseFloat(data.get('weight'));
        const weightUnit = data.get('weight-unit');
        let age = parseFloat(data.get('age'));
        const ageUnit = data.get('age-unit');
        const activity = data.get('activity');
        const condition = data.get('condition');
        const neutered = data.get('neutered') === 'on';
        const cancerProne = data.get('cancer-prone') === 'on';

        // Convert weight to kg for calculations
        const weightKg = weightUnit === 'lb' ? weight * 0.453592 : weight;
        const weightLb = weightUnit === 'lb' ? weight : weight / 0.453592;

        // Convert age to years
        const ageYears = ageUnit === 'months' ? age / 12 : age;

        // 1. Calculate RER (Resting Energy Requirement)
        const rer = 70 * Math.pow(weightKg, 0.75);

        // 2. Calculate MER (Maintenance Energy Requirement) factor
        let factor = 1.0;
        if (species === 'dog') {
            if (ageYears < 0.5) factor = 3.0; // Puppy < 6m
            else if (ageYears < 1) factor = 2.0; // Puppy 6-12m
            else {
                if (activity === 'high') factor = 3.0;
                else if (activity === 'low') factor = 1.2;
                else factor = neutered ? 1.6 : 1.8;

                if (condition === 'overweight') factor -= 0.2;
                if (condition === 'lean') factor += 0.2;
            }
        } else {
            // Cat
            if (ageYears < 1) factor = 2.5; // Kitten
            else {
                if (activity === 'high') factor = 1.6;
                else if (activity === 'low') factor = 1.0;
                else factor = neutered ? 1.2 : 1.4;

                if (condition === 'overweight') factor *= 0.8;
                if (condition === 'lean') factor *= 1.2;
            }
        }

        const dailyCalories = Math.round(rer * factor);

        // 3. Daily Food Weight Estimate (% of body weight)
        // Rule of thumb: 2-3% for adults, higher for young/active
        let foodPercent = 2.5;
        if (ageYears < 0.5) foodPercent = 8;
        else if (ageYears < 1) foodPercent = 5;
        else if (activity === 'high') foodPercent = 3.5;
        else if (activity === 'low' || condition === 'overweight') foodPercent = 2.0;

        const dailyFoodLb = weightLb * (foodPercent / 100);
        const dailyFoodOz = (dailyFoodLb * 16).toFixed(1);
        const dailyFoodGrams = (dailyFoodLb * 453.592).toFixed(0);

        // 4. Lifespan estimate (Educational/Observational only)
        // Based on Lippert study: ~1.8 to 2.5 years gain on fresh food vs processed
        let lifespanGain = 2.1;
        if (condition === 'overweight') lifespanGain -= 0.5;
        if (cancerProne) lifespanGain += 0.3; // Higher impact on high-risk breeds

        // 5. Ratios
        let ratios = { muscle: 80, bone: 10, organ: 10, veg: 0 };
        if (species === 'dog') {
            ratios = { muscle: 70, bone: 10, organ: 10, veg: 10 };
        }

        // 6. Costs
        const costDiy = Math.round(dailyFoodLb * 3 * 30.5); // ~$3/lb DIY
        const costSub = Math.round(dailyFoodLb * 8 * 30.5); // ~$8/lb Subscription
        const costKibble = Math.round(dailyFoodLb * 1.5 * 30.5); // ~$1.5/lb Premium Kibble

        // Update UI
        updateUI({
            calories: dailyCalories,
            factor: factor.toFixed(2),
            foodOz: dailyFoodOz,
            foodGrams: dailyFoodGrams,
            percent: foodPercent,
            lifespan: lifespanGain.toFixed(1),
            ratios,
            species,
            ageYears,
            cancerProne,
            costs: { diy: costDiy, sub: costSub, kibble: costKibble }
        });

        results.hidden = false;
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function updateUI(res) {
    document.getElementById('m-calories').textContent = res.calories.toLocaleString();
    document.getElementById('m-food-oz').textContent = res.foodOz;
    document.getElementById('m-percent').textContent = res.percent;
    document.getElementById('m-lifespan').textContent = res.lifespan;

    document.getElementById('m-calories-note').textContent = `MER Factor: ${res.factor}x RER`;
    document.getElementById('m-food-note').textContent = `~${res.foodGrams}g daily`;

    // Ratio Bars
    const rMuscle = document.getElementById('r-muscle-bar');
    const rBone = document.getElementById('r-bone-bar');
    const rOrgan = document.getElementById('r-organ-bar');
    const rVeg = document.getElementById('r-veg-bar');

    rMuscle.style.flex = res.ratios.muscle;
    rBone.style.flex = res.ratios.bone;
    rOrgan.style.flex = res.ratios.organ;
    rVeg.style.flex = res.ratios.veg;
    rVeg.style.display = res.ratios.veg > 0 ? 'flex' : 'none';

    // Ratio Text
    document.getElementById('r-muscle').textContent = `${res.ratios.muscle}% (~${(res.foodOz * res.ratios.muscle / 100).toFixed(1)} oz)`;
    document.getElementById('r-bone').textContent = `${res.ratios.bone}% (~${(res.foodOz * res.ratios.bone / 100).toFixed(1)} oz)`;
    document.getElementById('r-organ').textContent = `${res.ratios.organ}% (~${(res.foodOz * res.ratios.organ / 100).toFixed(1)} oz)`;
    
    const vegEl = document.getElementById('r-veg');
    if (res.ratios.veg > 0) {
        vegEl.parentElement.style.display = 'flex';
        vegEl.textContent = `${res.ratios.veg}% (~${(res.foodOz * res.ratios.veg / 100).toFixed(1)} oz)`;
    } else {
        vegEl.parentElement.style.display = 'none';
    }

    // Costs
    document.getElementById('c-diy').textContent = res.costs.diy;
    document.getElementById('c-sub').textContent = res.costs.sub;
    document.getElementById('c-kibble').textContent = res.costs.kibble;

    // Supplements
    const suppGrid = document.getElementById('supp-grid');
    suppGrid.innerHTML = '';
    
    const recs = getSupplementRecs(res);
    recs.forEach(s => {
        const card = document.createElement('div');
        card.className = 'supp-rec';
        card.innerHTML = `
            <span class="supp-rec-name">${s.name}</span>
            <span class="supp-rec-dose">${s.dose}</span>
            <p class="supp-rec-note">${s.note}</p>
        `;
        suppGrid.appendChild(card);
    });
}

function getSupplementRecs(res) {
    const recs = [];
    
    // Base recs
    recs.push({
        name: 'Omega-3 (Fish Oil)',
        dose: res.species === 'dog' ? '75mg/lb (EPA/DHA)' : '50mg/lb (EPA/DHA)',
        note: 'Crucial for anti-inflammation and heart health.'
    });

    if (res.ageYears > 7) {
        recs.push({
            name: 'Glucosamine / Chondroitin',
            dose: '15mg / lb',
            note: 'Support for aging joints and mobility.'
        });
        recs.push({
            name: 'CoQ10',
            dose: '1mg / lb',
            note: 'Mitochondrial and cardiac support for seniors.'
        });
    }

    if (res.cancerProne) {
        recs.push({
            name: 'Turkey Tail Mushroom',
            dose: '100mg / kg',
            note: 'Powerful immune support, especially for high-risk breeds.'
        });
    }

    recs.push({
        name: 'Probiotics',
        dose: '5-10 Billion CFU',
        note: 'Assists in transition and raw food digestion.'
    });

    return recs;
}
