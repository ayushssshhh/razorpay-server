
import express, { Request, Response } from "express";
import Razorpay from "razorpay";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Replace with your Razorpay credentials
const razorpay = new Razorpay({
  key_id: "rzp_test_RC0adg12Zucbco",
  key_secret: "T29llURhs30db33rQwYwH0i5",
});


// Keep track of SSE clients
const clients: Response[] = [];

// SSE endpoint
app.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Add client to list
  clients.push(res);

  req.on("close", () => {
    const index = clients.indexOf(res);
    if (index !== -1) clients.splice(index, 1);
  });
});

// Helper to send events to all clients
function sendEvent(data: any) {
  clients.forEach((client) => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Create Payment Link
app.post("/create-payment-link", async (req: Request, res: Response) => {
  try {
    const { plan, amount } = req.body as { plan: string; amount: number };

    const options = {
      amount: amount * 100,
      currency: "INR",
      description: `${plan} Plan Subscription`,
      customer: {
        name: "Demo User",
        email: "demo@example.com",
        contact: "9123456780", // valid test number
      },
      notify: { sms: true, email: true },
      callback_url: "http://localhost:5000/payment-status",
      callback_method: "get",
    };

    const paymentLink = await razorpay.paymentLink.create(options);

    res.json({ url: paymentLink.short_url, id: paymentLink.id, plan });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating payment link");
  }
});

// Razorpay Webhook
app.post("/webhook", (req: Request, res: Response) => {
  const secret = "@pqN_jvM@q82TgV";

  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (digest === req.headers["x-razorpay-signature"]) {
    console.log("✅ Webhook verified:", req.body);

    const event = req.body.event;
    if (event === "payment.authorized") {
      console.log("💰 Payment Successful");
      sendEvent({ status: "paid", plan: req.body.payload.payment.description });
    } else if (event === "payment.failed") {
      console.log("❌ Payment Failed");
      sendEvent({ status: "failed", plan: "Free Tier" });
    }
  } else {
    console.log("⚠️ Invalid webhook signature");
  }

  res.json({ status: "ok" });
});

// Optional: Payment status fetch API
app.get("/payment-status/:id", async (req: Request, res: Response) => {
  try {
    const link = await razorpay.paymentLink.fetch(req.params.id);
    res.json({ status: link.status });
  } catch (err) {
    res.status(500).send("Error fetching payment status");
  }
});

app.listen(5000, () => console.log("🚀 Server running on port 5000"));

