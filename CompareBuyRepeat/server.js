const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const PRIMARY_DB_URI = process.env.PRIMARY_MONGODB_URI;  // Primary DB URI (comparebuyrepeat)
const SECONDARY_DB_URI = process.env.SECONDARY_MONGODB_URI;  // Secondary DB URI (cbr-price_updates)

// Middleware
app.use(express.json());
app.use(cors()); // Allow requests from anywhere

// Middleware to handle JSON errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  next();
});

// ✅ Connect to MongoDB
let db, productCollection, priceUpdatesCollection, schemaDefinitionCollection;

// Primary connection
mongoose.connect(PRIMARY_DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("✅ Connected to Primary MongoDB Atlas (comparebuyrepeat)");

  db = mongoose.connection.useDb("comparebuyrepeat");
  schemaDefinitionCollection = db.collection("schema_definition");
  productCollection = db.collection("products_data");
}).catch(err => console.error("❌ MongoDB Connection Error:", err));

// Secondary connection for price_updates
const secondaryDb = mongoose.createConnection(SECONDARY_DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

secondaryDb.once("open", () => {
  console.log("✅ Connected to Secondary MongoDB Atlas (cbr-price_updates)");
  priceUpdatesCollection = secondaryDb.collection("price_updates");
});

// 🟢 Fetch List of Categories
app.get("/categories", async (req, res) => {
  try {
    const categories = await schemaDefinitionCollection.distinct("category");
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Error fetching categories" });
  }
});

// 🟢 Fetch Schema Definition for a Category
app.get("/get-schema/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const schema = await schemaDefinitionCollection.findOne({ category });

    if (!schema) {
      return res.status(404).json({ error: "Schema not found for this category" });
    }

    res.json(schema);
  } catch (error) {
    res.status(500).json({ error: "Error fetching schema definition" });
  }
});

// 🟢 Fetch Brands for a Category
app.get("/:category/brands", async (req, res) => {
  try {
    const { category } = req.params;
    const brands = await productCollection.distinct("brand", { category: { $regex: new RegExp(`^${category}$`, "i") } });
    res.json(brands);
  } catch (error) {
    res.status(500).json({ error: "Error fetching brands" });
  }
});

// 🟢 Fetch Models for a Category & Brand
app.get("/:category/:brand/models", async (req, res) => {
  try {
    const { category, brand } = req.params;
    const models = await productCollection.distinct("name", { category: { $regex: new RegExp(`^${category}$`, "i") }, brand: { $regex: new RegExp(`^${brand}$`, "i") } });
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: "Error fetching models" });
  }
});

// 🟢 Fetch Product Details by category, brand, and model
app.get("/:category/:brand/:model/productDetails", async (req, res) => {
  try {
    const { category, brand, model } = req.params;
    const product = await productCollection.findOne({
      category: { $regex: new RegExp(`^${category}$`, "i") },
      brand: { $regex: new RegExp(`^${brand}$`, "i") },
      name: { $regex: new RegExp(`^${model}$`, "i") }
    });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: "Error fetching product data" });
  }
});

// 🟢 Search Products by Category with Result Count
app.get("/:category/search", async (req, res) => {
  try {
    const { category } = req.params;
    const { query } = req.query;

    // Check if query length is greater than or equal to 3 for loose search
    if (!query || query.length < 3) {
      return res.status(400).json({ error: "Query parameter is required and must be at least 3 characters long for suggestions." });
    }

    // Build search criteria
    const searchCriteria = { 
      category: { $regex: new RegExp(`^${category}$`, "i") }
    };

    // Include additional search criteria if query exists
    searchCriteria.$or = [
      { name: { $regex: query, $options: "i" } },
      { brand: { $regex: query, $options: "i" } }
    ];

    // Perform the search
    const products = await productCollection.find(searchCriteria, { _id: 0, name: 1, brand: 1 }).limit(20).toArray();

    // Return the result count and the products found
    if (products.length === 0) {
      return res.status(404).json({ error: "No matching products found", count: 0 });
    }

    res.json({
      count: products.length,  // Return result count
      products: products       // Return the list of products
    });
  } catch (error) {
    res.status(500).json({ error: "Error searching products" });
  }
});

// 🟢 Search Products without Category Restriction (loose search)
app.get("/search", async (req, res) => {
  try {
    const { query } = req.query;

    // Check if query length is greater than or equal to 3 for loose search
    if (!query || query.length < 3) {
      return res.status(400).json({ error: "Query parameter is required and must be at least 3 characters long for suggestions." });
    }

    const products = await productCollection.find(
      { 
        $or: [
          { name: { $regex: query, $options: "i" } },
          { brand: { $regex: query, $options: "i" } }
        ]
      },
      { _id: 0, name: 1, brand: 1 }
    ).limit(20).toArray();

    // Return result count and the products found
    if (products.length === 0) {
      return res.status(404).json({ error: "No matching products found", count: 0 });
    }

    res.json({
      count: products.length,  // Return result count
      products: products       // Return the list of products
    });
  } catch (error) {
    res.status(500).json({ error: "Error searching products" });
  }
});

// 🟢 Insert Single or Bulk Products with Mandatory Fields Check
app.post("/insert-products", async (req, res) => {
  try {
    const products = req.body;

    if (Array.isArray(products)) {
      for (let product of products) {
        const category = product.category;

        // Fetch the schema for the category
        const schema = await schemaDefinitionCollection.findOne({ category: { $regex: new RegExp(`^${category}$`, "i") } });

        if (!schema) {
          return res.status(400).json({ error: `Schema not found for category: ${category}` });
        }

        const mandatoryFields = schema.settings.mandatory_fields;

        // Check if mandatory fields are provided and not empty
        for (let field of mandatoryFields) {
          if (!product[field] || product[field].trim() === "") {
            return res.status(400).json({ error: `Missing or empty mandatory field: ${field}` });
          }
        }
      }

      // Insert bulk products
      await productCollection.insertMany(products);
      res.json({ message: "Bulk products inserted successfully" });
    } else {
      const product = products;

      // Fetch the schema for the category
      const category = product.category;
      const schema = await schemaDefinitionCollection.findOne({ category: { $regex: new RegExp(`^${category}$`, "i") } });

      if (!schema) {
        return res.status(400).json({ error: `Schema not found for category: ${category}` });
      }

      const mandatoryFields = schema.settings.mandatory_fields;

      // Check if mandatory fields are provided and not empty
      for (let field of mandatoryFields) {
        if (!product[field] || product[field].trim() === "") {
          return res.status(400).json({ error: `Missing or empty mandatory field: ${field}` });
        }
      }

      // Insert single product
      await productCollection.insertOne(product);
      res.json({ message: "Product inserted successfully" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error inserting products" });
  }
});


// 🟢 Update Product Price
app.post("/update-price", async (req, res) => {
  try {
    const { category, brand, name, price } = req.body;

    if (!category || !brand || !name || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const lastPriceEntry = await priceUpdatesCollection.find({ category, brand, product_name: name }).sort({ timestamp: -1 }).limit(1).toArray();

    if (lastPriceEntry.length === 0 || lastPriceEntry[0].price !== price) {
      const newPriceEntry = {
        category,
        brand,
        product_name: name,
        price,
        timestamp: new Date(),
      };

      await priceUpdatesCollection.insertOne(newPriceEntry);

      const updatedProduct = await productCollection.findOneAndUpdate(
        { category, brand, name },
        { $set: { price } },
        { returnDocument: 'after' }
      );

      res.json({ success: true, message: "Price updated successfully", updatedProduct });
    } else {
      res.json({ success: false, message: "No price change detected" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error updating price" });
  }
});

// 🟢 Insert Schema Definition if not existing
app.post("/insert-schema", async (req, res) => {
  try {
    const schema = req.body;

    // Check if 'Category' exists in the request body
    if (!schema || !schema.Category) {
      return res.status(400).json({ error: "'Category' is required" });
    }

    // Perform the update (or insert if schema doesn't exist)
    const updatedSchema = await schemaDefinitionCollection.findOneAndUpdate(
      { Category: schema.Category },  // Find by Category
      { $set: schema },               // Set the new schema
      { upsert: true, returnDocument: 'after' } // Insert if not exists, return updated schema
    );

    // Send response back
    res.json({ success: true, message: "Schema inserted/updated successfully", schema: updatedSchema.value });
  } catch (error) {
    console.error("Error inserting/updating schema:", error);
    res.status(500).json({ error: "Error inserting/updating schema" });
  }
});


// Middleware to handle JSON errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  next();
});

// 🟢 Fetch Products by Category
app.get("/products/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const products = await productCollection.find({ category })
      .project({ name: 1, brand: 1, image: 1, price: 1 }) // Select only necessary fields
      .limit(10) // Optional: limit the number of products per category
      .toArray();

    if (!products || products.length === 0) {
      return res.status(404).json({ error: "No products found in this category" });
    }

    res.json({ count: products.length, products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Error fetching products" });
  }
});

// 🟢 Fetch Recommended Products Based on the Same Brand
app.get("/recommended/brand/:category/:brand", async (req, res) => {
  try {
    const { category, brand } = req.params;

    // Fetch products from the same category and brand
    const recommendedProducts = await productCollection.find({
      category: { $regex: new RegExp(`^${category}$`, "i") },
      brand: { $regex: new RegExp(`^${brand}$`, "i") },
    })
    .limit(10)  // Limit to top 10 recommended products
    .toArray();

    if (recommendedProducts.length === 0) {
      return res.status(404).json({ error: "No recommended products found from the same brand" });
    }

    res.json({
      count: recommendedProducts.length,
      recommendedProducts
    });
  } catch (error) {
    console.error("Error fetching recommended products from the same brand:", error);
    res.status(500).json({ error: "Error fetching recommended products from the same brand" });
  }
});

// 🟢 Fetch Recommended Products Based on the Same Category
app.get("/recommended/category/:category", async (req, res) => {
  try {
    const { category } = req.params;

    // Fetch products from the same category
    const recommendedProducts = await productCollection.find({
      category: { $regex: new RegExp(`^${category}$`, "i") }
    })
    .limit(10)  // Limit to top 10 recommended products
    .toArray();

    if (recommendedProducts.length === 0) {
      return res.status(404).json({ error: "No recommended products found from the same category" });
    }

    res.json({
      count: recommendedProducts.length,
      recommendedProducts
    });
  } catch (error) {
    console.error("Error fetching recommended products from the same category:", error);
    res.status(500).json({ error: "Error fetching recommended products from the same category" });
  }
});


// 🟢 Fetch Hot Selling Products (Optional - Based on popularity/rating)
app.get("/hot-selling", async (req, res) => {
  try {
    const hotSellingProducts = await productCollection.find()
      .sort({ "rating": -1 }) // Sort by rating or other metric like sales count
      .limit(10)
      .toArray();

    res.json({ count: hotSellingProducts.length, hotSellingProducts });
  } catch (error) {
    console.error("Error fetching hot selling products:", error);
    res.status(500).json({ error: "Error fetching hot selling products" });
  }
});

// ✅ Start Server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
