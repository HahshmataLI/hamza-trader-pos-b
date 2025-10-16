const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    description: String,
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    image: String,
    level: {
      type: Number,
      enum: [1, 2, 3], // 1=Main, 2=Sub, 3=Sub-sub
      default: 1,
    },
    // Category-specific attribute templates
    attributes: [
      {
        name: String, // Field name (e.g., 'size', 'brand')
        label: String, // Display label (e.g., 'Shoe Size')
        type: {
          // Field type
          type: String,
          enum: ["text", "number", "select", "boolean"],
        },
        required: Boolean, // Is this field required?
        options: [String], // For select fields
        validation: {
          // Field validation rules
          min: Number,
          max: Number,
          pattern: String,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for subcategories
categorySchema.virtual("subcategories", {
  ref: "Category",
  localField: "_id",
  foreignField: "parent",
});

// Index for better performance
categorySchema.index({ parent: 1 });
categorySchema.index({ level: 1 });

module.exports = mongoose.model("Category", categorySchema);
