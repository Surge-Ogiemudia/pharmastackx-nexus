import mongoose, { Schema } from 'mongoose';

const PharmacistResponseSchema = new Schema(
  {
    pharmacistId: String,
    pharmacistName: String,
    pharmacistAddress: String,
    available: Boolean,
    price: Number,
    distance: Number,
    responseRate: Number,
    stockLikelihood: Number,
    respondedAt: String,
  },
  { _id: false }
);

const NexusRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    medicines: { type: Schema.Types.Mixed, required: true },
    userState: { type: String, required: true },
    userPhone: { type: String, required: true },
    responses: { type: [PharmacistResponseSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Auto-delete requests after 2 hours
NexusRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

export default mongoose.models.NexusRequest ||
  mongoose.model('NexusRequest', NexusRequestSchema);
