console.log("working");

const API_BASE = "https://positive-substantial-lint.glitch.me";

let lastSelectedCategory = "";
let lastSelectedBrand1 = "";
let lastSelectedBrand2 = "";

// Fetch Categories
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        if (!response.ok) throw new Error("Failed to load categories");

        const categories = await response.json();
        const categorySelect = document.getElementById("category-select");

        categorySelect.innerHTML = `<option value="">Select Category</option>`;
        categories.forEach(category => {
            categorySelect.innerHTML += `<option value="${category}">${category}</option>`;
        });

        resetUI();
    } catch (error) {
        console.error("Error fetching categories:", error);
    }
}

// Fetch Brands based on Category
async function loadBrands(category) {
    if (!category || category === lastSelectedCategory) return;
    lastSelectedCategory = category;

    try {
        const response = await fetch(`${API_BASE}/brands/${category}`);
        if (!response.ok) throw new Error("Failed to load brands");

        const brands = await response.json();
        updateDropdown("brand1-select", brands, "Select Brand");
        updateDropdown("brand2-select", brands, "Select Brand");

        document.getElementById("brand-product-selects").style.display = "table";
        document.getElementById("product1-select").style.display = "none";
        document.getElementById("product2-select").style.display = "none";
        document.getElementById("compare-btn").style.display = "none";
    } catch (error) {
        console.error("Error fetching brands:", error);
    }
}

// Fetch Models based on Brand
async function loadModels(category, brand, productSelectId) {
    if (!category || !brand) return;

    try {
        const response = await fetch(`${API_BASE}/models/${category}/${brand}`);
        if (!response.ok) throw new Error("Failed to load models");

        const models = await response.json();
        updateDropdown(productSelectId, models, "Select Model");

        document.getElementById(productSelectId).style.display = "block";
        checkCompareButtonVisibility();
    } catch (error) {
        console.error("Error fetching models:", error);
    }
}

// Update dropdown options dynamically
function updateDropdown(selectId, items, defaultText) {
    const selectElement = document.getElementById(selectId);
    selectElement.innerHTML = `<option value="">${defaultText}</option>`;
    items.forEach(item => {
        selectElement.innerHTML += `<option value="${item}">${item}</option>`;
    });
}

// Reset UI for linear dropdown flow
function resetUI() {
    document.getElementById("brand-product-selects").style.display = "none";
    document.getElementById("product1-select").style.display = "none";
    document.getElementById("product2-select").style.display = "none";
    document.getElementById("compare-btn").style.display = "none";
}

// Show Compare button when both products are selected
function checkCompareButtonVisibility() {
    const product1 = document.getElementById("product1-select").value;
    const product2 = document.getElementById("product2-select").value;
    document.getElementById("compare-btn").style.display = product1 && product2 ? "inline-block" : "none";
}

// Fetch Product Data
async function loadProductData(category, brand, model, target) {
    if (!category || !brand || !model) return;

    try {
        const response = await fetch(`${API_BASE}/product/${category}/${brand}/${model}`);
        if (!response.ok) throw new Error("Failed to fetch product data");

        target.product = await response.json();
    } catch (error) {
        console.error("Error fetching product data:", error);
    }
}

// Compare Products
async function compareProducts() {
    const category = document.getElementById("category-select").value;
    const brand1 = document.getElementById("brand1-select").value;
    const brand2 = document.getElementById("brand2-select").value;
    const model1 = document.getElementById("product1-select").value;
    const model2 = document.getElementById("product2-select").value;

    if (!model1 || !model2) {
        alert("Please select both products for comparison.");
        return;
    }

    let product1 = {};
    let product2 = {};

    await Promise.all([
        loadProductData(category, brand1, model1, product1),
        loadProductData(category, brand2, model2, product2)
    ]);

    if (product1.product && product2.product) {
        displayComparison(category, product1.product, product2.product);
    } else {
        alert("Product data could not be fetched. Please try again.");
    }
}

// Fetch Definitions
async function loadDefinitions(category) {
    try {
        const response = await fetch(`${API_BASE}/definitions/${category}`);
        if (!response.ok) throw new Error("Definitions file not found");
        return await response.json();
    } catch {
        return {};
    }
}

// Display Comparison Table
async function displayComparison(category, product1, product2) {
    const comparisonResult = document.getElementById("comparison-result");
    const definitions = await loadDefinitions(category);

    if (!product1 || !product2) {
        comparisonResult.innerHTML = "<p>Product data not available.</p>";
        return;
    }

    let tableContent = `<h3>Comparison</h3><table style="width: 100%; border: 1px solid #ddd; border-collapse: collapse;">`;

    tableContent += `
      <thead>
        <tr style="background-color: #f4f4f4;">
          <th>Feature</th>
          <th>${product1.name}</th>
          <th>${product2.name}</th>
        </tr>
      </thead>
      <tbody>`;

    // Loop through all top-level categories (Hardware, Display, Camera, etc.)
    Object.keys({...product1.features, ...product2.features}).forEach(categoryName => {
        tableContent += `<tr style="background-color: #e0e0e0; font-weight: bold;">
                            <td colspan="3">${categoryName}</td>
                         </tr>`;

        Object.keys({...product1.features[categoryName] || {}, ...product2.features[categoryName] || {}}).forEach(feature => {
            const value1 = product1.features[categoryName]?.[feature] || "No";
            const value2 = product2.features[categoryName]?.[feature] || "No";

            let definition = definitions[feature]
                ? `<span class="definition-label" onclick="showDefinition('${feature}', '${definitions[feature].definition.replace(/'/g, "\\'")}')">${feature}</span>`
                : feature;

            // Check if value is an object (e.g., Rear Camera, Build Material)
            if (typeof value1 === "object" || typeof value2 === "object") {
                // Ensure object keys are meaningful and not just numerical indexes
                const validSubKeys = Object.keys({...value1, ...value2}).filter(k => isNaN(k));

                if (validSubKeys.length > 0) {
                    tableContent += `<tr style="background-color: #f8f8f8; font-weight: bold;">
                                        <td colspan="3">${definition}</td>
                                     </tr>`;

                    validSubKeys.forEach(subFeature => {
                        const subValue1 = value1?.[subFeature] || "No";
                        const subValue2 = value2?.[subFeature] || "No";

                        // If subFeature has deeper levels (e.g., Telephoto → Resolution)
                        if (typeof subValue1 === "object" || typeof subValue2 === "object") {
                            const validThirdLevelKeys = Object.keys({...subValue1, ...subValue2}).filter(k => isNaN(k));

                            if (validThirdLevelKeys.length > 0) {
                                tableContent += `<tr style="background-color: #f0f0f0; font-weight: bold;">
                                                    <td colspan="3">${subFeature}</td>
                                                 </tr>`;

                                validThirdLevelKeys.forEach(thirdLevelFeature => {
                                    const thirdValue1 = subValue1?.[thirdLevelFeature] || "No";
                                    const thirdValue2 = subValue2?.[thirdLevelFeature] || "No";

                                    let thirdDefinition = definitions[thirdLevelFeature] 
                                        ? `<span class="definition-label" onclick="showDefinition('${thirdLevelFeature}', '${definitions[thirdLevelFeature].definition.replace(/'/g, "\\'")}')">${thirdLevelFeature}</span>`
                                        : thirdLevelFeature;

                                    tableContent += `<tr>
                                                        <td>${thirdDefinition}</td>
                                                        <td>${thirdValue1}</td>
                                                        <td>${thirdValue2}</td>
                                                     </tr>`;
                                });
                            }
                        } else {
                            let subDefinition = definitions[subFeature] 
                                ? `<span class="definition-label" onclick="showDefinition('${subFeature}', '${definitions[subFeature].definition.replace(/'/g, "\\'")}')">${subFeature}</span>`
                                : subFeature;

                            tableContent += `<tr>
                                                <td>${subDefinition}</td>
                                                <td>${subValue1}</td>
                                                <td>${subValue2}</td>
                                             </tr>`;
                        }
                    });
                }
            } else {
                tableContent += `<tr>
                                    <td>${definition}</td>
                                    <td>${value1}</td>
                                    <td>${value2}</td>
                                 </tr>`;
            }
        });
    });

    tableContent += `</tbody></table>`;
    comparisonResult.innerHTML = tableContent;
}

// Show Modal with Definition
function showDefinition(title, content) {
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-content").innerText = content;
    document.getElementById("definition-modal").style.display = "flex";
}

// Close Modal
function closeModal() {
    document.getElementById("definition-modal").style.display = "none";
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById("definition-modal");
    if (event.target === modal) {
        closeModal();
    }
};

// Event Listeners
document.getElementById("category-select").addEventListener("change", function () {
    const category = this.value;
    if (category) loadBrands(category);
});

document.getElementById("brand1-select").addEventListener("change", function () {
    const category = document.getElementById("category-select").value;
    const brand = this.value;
    if (brand && brand !== lastSelectedBrand1) {
        lastSelectedBrand1 = brand;
        loadModels(category, brand, "product1-select");
    }
});

document.getElementById("brand2-select").addEventListener("change", function () {
    const category = document.getElementById("category-select").value;
    const brand = this.value;
    if (brand && brand !== lastSelectedBrand2) {
        lastSelectedBrand2 = brand;
        loadModels(category, brand, "product2-select");
    }
});

document.getElementById("product1-select").addEventListener("change", checkCompareButtonVisibility);
document.getElementById("product2-select").addEventListener("change", checkCompareButtonVisibility);
document.getElementById("compare-btn").addEventListener("click", compareProducts);

// Initialize Categories
loadCategories();
