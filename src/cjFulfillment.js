const fs = require("fs");
const path = require("path");
const { log } = require("./logger");
const { createOrder } = require("./cjApi");

async function prepareCJOrder(order, products = []) {
  if (!order || !order.session_id) {
    log(`[CJ] Invalid order: missing session_id`);
    return null;
  }

  const cjOrder = {
    order_id: order.session_id,
    source: "GetPawsy",
    currency: order.currency || "usd",
    shipping_address: {
      name: order.customer_email || "Unknown",
      street: "",
      city: "",
      zip: "",
      country: ""
    },
    items: [],
    created: order.created || new Date().toISOString()
  };

  // For now, we don't have shipping address from Stripe session
  // This would be populated from customer data when integrated with full checkout flow
  
  log(`[CJ] Prepared order ${order.session_id} for export`);
  
  return cjOrder;
}

function savePendingCJOrder(order) {
  if (!order) return false;
  
  try {
    const pendingDir = path.join(__dirname, "..", "data", "cj-orders", "pending");
    fs.mkdirSync(pendingDir, { recursive: true });
    
    const filePath = path.join(pendingDir, `${order.order_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
    
    log(`[CJ] Order saved to pending: ${order.order_id}`);
    return true;
  } catch (err) {
    log(`[CJ] Error saving pending order: ${err.message}`);
    return false;
  }
}

function exportCJOrder(orderId) {
  try {
    const pendingDir = path.join(__dirname, "..", "data", "cj-orders", "pending");
    const exportedDir = path.join(__dirname, "..", "data", "cj-orders", "exported");
    
    const pendingFile = path.join(pendingDir, `${orderId}.json`);
    if (!fs.existsSync(pendingFile)) {
      log(`[CJ] Order not found in pending: ${orderId}`);
      return false;
    }
    
    fs.mkdirSync(exportedDir, { recursive: true });
    const exportedFile = path.join(exportedDir, `${orderId}.json`);
    
    fs.renameSync(pendingFile, exportedFile);
    log(`[CJ] Order exported: ${orderId}`);
    
    return true;
  } catch (err) {
    log(`[CJ] Error exporting order: ${err.message}`);
    return false;
  }
}

function getCJOrders() {
  const result = { pending: [], exported: [] };
  
  try {
    const pendingDir = path.join(__dirname, "..", "data", "cj-orders", "pending");
    const exportedDir = path.join(__dirname, "..", "data", "cj-orders", "exported");
    
    if (fs.existsSync(pendingDir)) {
      const files = fs.readdirSync(pendingDir);
      files.forEach(f => {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(pendingDir, f), "utf-8"));
          result.pending.push({ ...content, status: "pending" });
        } catch (e) {}
      });
    }
    
    if (fs.existsSync(exportedDir)) {
      const files = fs.readdirSync(exportedDir);
      files.forEach(f => {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(exportedDir, f), "utf-8"));
          result.exported.push({ ...content, status: "exported" });
        } catch (e) {}
      });
    }
  } catch (err) {
    log(`[CJ] Error reading CJ orders: ${err.message}`);
  }
  
  return result;
}

async function placePendingOrders(maxOrders = 3) {
  const pendingDir = path.join(__dirname, "..", "data", "cj-orders", "pending");
  const result = { ok: true, placed: 0, failed: 0, errors: [] };

  if (!fs.existsSync(pendingDir)) return result;

  try {
    const files = fs.readdirSync(pendingDir).slice(0, maxOrders);

    for (const file of files) {
      try {
        const filePath = path.join(pendingDir, file);
        const cjOrder = JSON.parse(fs.readFileSync(filePath, "utf-8"));

        log(`[CJ API] Placing order: ${cjOrder.order_id}`);
        const apiResult = await createOrder(cjOrder);

        if (apiResult.ok) {
          // Update order in data/orders.json
          const ordersPath = path.join(__dirname, "..", "data", "orders.json");
          if (fs.existsSync(ordersPath)) {
            let orders = JSON.parse(fs.readFileSync(ordersPath, "utf-8")) || [];
            const order = orders.find(o => o.session_id === cjOrder.order_id);
            if (order) {
              order.fulfillment_status = "placed";
              order.cj_order_id = apiResult.orderId;
              order.api_endpoint_used = apiResult.endpoint;
              order.placed_at = new Date().toISOString();
              fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
            }
          }

          // Move to exported with metadata
          const exportedDir = path.join(__dirname, "..", "data", "cj-orders", "exported");
          fs.mkdirSync(exportedDir, { recursive: true });
          const exportedFile = path.join(exportedDir, file);
          fs.writeFileSync(exportedFile, JSON.stringify({
            ...cjOrder,
            cj_order_id: apiResult.orderId,
            placed_at: new Date().toISOString(),
            api_endpoint_used: apiResult.endpoint
          }, null, 2));

          fs.unlinkSync(filePath);
          result.placed++;
          log(`[CJ API] Order placed: ${cjOrder.order_id} → ${apiResult.orderId}`);
        } else {
          result.failed++;
          result.errors.push({
            order_id: cjOrder.order_id,
            error: apiResult.error
          });

          // Update order status to error
          const ordersPath = path.join(__dirname, "..", "data", "orders.json");
          if (fs.existsSync(ordersPath)) {
            let orders = JSON.parse(fs.readFileSync(ordersPath, "utf-8")) || [];
            const order = orders.find(o => o.session_id === cjOrder.order_id);
            if (order) {
              order.fulfillment_status = "error";
              order.fulfillment_error = apiResult.error;
              fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
            }
          }

          // Add error to pending file
          cjOrder.last_error = apiResult.error;
          cjOrder.last_error_at = new Date().toISOString();
          fs.writeFileSync(filePath, JSON.stringify(cjOrder, null, 2));

          log(`[CJ API] Order placement failed: ${cjOrder.order_id} - ${apiResult.error}`);
        }
      } catch (err) {
        result.failed++;
        result.errors.push({ error: err.message });
        log(`[CJ API] Error processing order: ${err.message}`);
      }
    }
  } catch (err) {
    result.ok = false;
    result.errors.push({ error: err.message });
    log(`[CJ API] Batch placement error: ${err.message}`);
  }

  return result;
}

module.exports = { prepareCJOrder, savePendingCJOrder, exportCJOrder, getCJOrders, placePendingOrders };
