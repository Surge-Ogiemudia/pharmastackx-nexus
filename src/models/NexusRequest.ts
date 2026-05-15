import mongoose, { Schema } from 'mongoose';

const MedicineAvailabilitySchema = new Schema(
  {
    medicineIndex: Number,
    name: String,
    available: Boolean,
    price: { type: Number, default: 0 },
  },
  { _id: false }
);

const PharmacistResponseSchema = new Schema(
  {
    pharmacistId: String,
    pharmacistName: String,
    pharmacistAddress: String,
    available: Boolean,
    price: Number,
    items: { type: [MedicineAvailabilitySchema], default: [] },
    pharmacistNotes: String,
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
    patientNotes: { type: String },
    responses: { type: [PharmacistResponseSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Auto-delete requests after 2 hours
NexusRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

export default mongoose.models.NexusRequest ||
  mongoose.model('NexusRequest', NexusRequestSchema);
