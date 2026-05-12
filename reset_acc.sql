BEGIN;

WITH target AS (
  SELECT id FROM "User"
   WHERE email IN ('ranilperera+1@gmail.com', 'renilperera+10@gmail.com')
), target_orders AS (
  SELECT id FROM "Order"
   WHERE customer_id IN (SELECT id FROM target)
      OR contractor_user_id IN (SELECT id FROM target)
), target_disputes AS (
  SELECT id FROM "Dispute" WHERE order_id IN (SELECT id FROM target_orders)
)
SELECT
  (SELECT COUNT(*) FROM target)         AS users,
  (SELECT COUNT(*) FROM target_orders)  AS orders_to_delete,
  (SELECT COUNT(*) FROM target_disputes) AS disputes_to_delete;

-- Delete in FK-safe order (children → parent)
DELETE FROM "DisputeSubmission"        WHERE dispute_id        IN (SELECT id FROM "Dispute" WHERE order_id IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com'))));
DELETE FROM "Dispute"                  WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "ChangeRequest"            WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "MilestoneRelease"         WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "OrderAccessCredential"    WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "OrderChatMessage"         WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "OrderDeliverable"         WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "OrderMessage"             WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "WorkLog"                  WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "ScopeModificationRequest" WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "Rating"                   WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "PurchaseOrder"            WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "PayoutRecord"             WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "BankTransferPayment"      WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "CompanyOrderProposal"     WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "CompanyPayoutRecord"      WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
DELETE FROM "CompanyInvoice"           WHERE order_id          IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));
-- Service invoices may reference orders but service_invoice itself outlives the order (B2B record)
UPDATE "service_invoices" SET order_id = NULL WHERE order_id IN (SELECT id FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')));

DELETE FROM "Order" WHERE customer_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com')) OR contractor_user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com'));

-- Reset every limit counter on each user's subscription
UPDATE "Subscription"
   SET current_task_count        = 0,
       current_project_count     = 0,
       current_bid_count         = 0,
       current_ai_request_count  = 0,
       current_order_count       = 0,
       current_tender_count      = 0,
       usage_reset_at            = NOW(),
       updated_at                = NOW()
 WHERE user_id IN (SELECT id FROM "User" WHERE email IN ('ranilperera+1@gmail.com','renilperera+10@gmail.com'));

COMMIT;