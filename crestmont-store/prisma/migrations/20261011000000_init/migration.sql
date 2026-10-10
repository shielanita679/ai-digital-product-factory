-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `order_number` VARCHAR(16) NOT NULL,
    `stripe_checkout_session_id` VARCHAR(255) NULL,
    `stripe_payment_intent_id` VARCHAR(255) NULL,
    `customer_email` VARCHAR(254) NULL,
    `customer_name` VARCHAR(255) NULL,
    `shipping_name` VARCHAR(255) NULL,
    `shipping_line1` VARCHAR(255) NULL,
    `shipping_line2` VARCHAR(255) NULL,
    `shipping_city` VARCHAR(255) NULL,
    `shipping_state` VARCHAR(255) NULL,
    `shipping_postal_code` VARCHAR(32) NULL,
    `shipping_country` CHAR(2) NULL,
    `currency` CHAR(3) NOT NULL,
    `subtotal_amount` INTEGER NOT NULL DEFAULT 0,
    `shipping_amount` INTEGER NOT NULL DEFAULT 0,
    `tax_amount` INTEGER NOT NULL DEFAULT 0,
    `discount_amount` INTEGER NOT NULL DEFAULT 0,
    `total_amount` INTEGER NOT NULL DEFAULT 0,
    `refunded_amount` INTEGER NOT NULL DEFAULT 0,
    `payment_status` ENUM('PENDING', 'PROCESSING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `fulfillment_status` ENUM('UNFULFILLED', 'ON_HOLD', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'UNFULFILLED',
    `reservation_status` ENUM('HELD', 'CONVERTED', 'RELEASED') NOT NULL DEFAULT 'HELD',
    `reservation_expires_at` DATETIME(3) NOT NULL,
    `requires_review` BOOLEAN NOT NULL DEFAULT false,
    `review_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `paid_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,

    UNIQUE INDEX `orders_order_number_key`(`order_number`),
    UNIQUE INDEX `orders_stripe_checkout_session_id_key`(`stripe_checkout_session_id`),
    UNIQUE INDEX `orders_stripe_payment_intent_id_key`(`stripe_payment_intent_id`),
    INDEX `orders_payment_status_idx`(`payment_status`),
    INDEX `orders_fulfillment_status_idx`(`fulfillment_status`),
    INDEX `orders_created_at_idx`(`created_at`),
    INDEX `orders_customer_email_idx`(`customer_email`),
    INDEX `orders_reservation_status_reservation_expires_at_idx`(`reservation_status`, `reservation_expires_at`),
    INDEX `orders_requires_review_idx`(`requires_review`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `product_id` VARCHAR(64) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `variant_name` VARCHAR(255) NULL,
    `quantity` INTEGER NOT NULL,
    `unit_amount` INTEGER NOT NULL,
    `line_amount` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_items_sku_idx`(`sku`),
    UNIQUE INDEX `order_items_order_id_sku_key`(`order_id`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stripe_events` (
    `id` CHAR(36) NOT NULL,
    `stripe_event_id` VARCHAR(255) NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `status` ENUM('PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED') NOT NULL DEFAULT 'PROCESSING',
    `order_id` CHAR(36) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 1,
    `last_error` TEXT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    UNIQUE INDEX `stripe_events_stripe_event_id_key`(`stripe_event_id`),
    INDEX `stripe_events_status_received_at_idx`(`status`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory` (
    `id` CHAR(36) NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `product_id` VARCHAR(64) NOT NULL,
    `quantity_on_hand` INTEGER NOT NULL DEFAULT 0,
    `quantity_reserved` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_sku_key`(`sku`),
    INDEX `inventory_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` CHAR(36) NOT NULL,
    `inventory_id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NULL,
    `type` ENUM('INITIAL_STOCK', 'SALE', 'REFUND_RESTOCK', 'CANCELLATION_RESTOCK', 'RETURN_RESTOCK', 'MANUAL_ADJUSTMENT') NOT NULL,
    `quantity_delta` INTEGER NOT NULL,
    `quantity_on_hand_after` INTEGER NOT NULL,
    `reason` VARCHAR(500) NULL,
    `reference` VARCHAR(255) NULL,
    `sale_key` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inventory_movements_sale_key_key`(`sale_key`),
    INDEX `inventory_movements_inventory_id_created_at_idx`(`inventory_id`, `created_at`),
    INDEX `inventory_movements_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `carrier` VARCHAR(100) NULL,
    `service` VARCHAR(100) NULL,
    `tracking_number` VARCHAR(100) NULL,
    `tracking_url` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', 'RETURNED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `shipped_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shipments_order_id_idx`(`order_id`),
    UNIQUE INDEX `shipments_carrier_tracking_number_key`(`carrier`, `tracking_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `stripe_events` ADD CONSTRAINT `stripe_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_inventory_id_fkey` FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- =============================================================================
-- Hand-written integrity rules (Prisma can't express CHECK constraints).
-- Enforced by MySQL 8.0.16+ and MariaDB 10.2+ (Hostinger provides MariaDB/MySQL).
-- Case checks compare as BINARY because the default collation is case-insensitive.
-- These are the database's last line of defence; the application enforces the
-- same rules first. Never remove them to "make an error go away".
-- =============================================================================

-- inventory: stock can never be negative, and reservations never exceed stock.
ALTER TABLE `inventory`
  ADD CONSTRAINT `inventory_on_hand_non_negative`     CHECK (`quantity_on_hand` >= 0),
  ADD CONSTRAINT `inventory_reserved_non_negative`    CHECK (`quantity_reserved` >= 0),
  ADD CONSTRAINT `inventory_reserved_within_on_hand`  CHECK (`quantity_reserved` <= `quantity_on_hand`),
  ADD CONSTRAINT `inventory_sku_format`               CHECK (CAST(`sku` AS BINARY) = CAST(UPPER(`sku`) AS BINARY) AND `sku` REGEXP '^CH-[A-Z0-9]+(-[A-Z0-9]+)+$');

-- orders
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_order_number_format`   CHECK (CAST(`order_number` AS BINARY) = CAST(UPPER(`order_number`) AS BINARY) AND `order_number` REGEXP '^CH-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  ADD CONSTRAINT `orders_currency_format`       CHECK (CAST(`currency` AS BINARY) = CAST(LOWER(`currency`) AS BINARY) AND `currency` REGEXP '^[a-z]{3}$'),
  ADD CONSTRAINT `orders_amounts_non_negative`  CHECK (`subtotal_amount` >= 0 AND `shipping_amount` >= 0 AND `tax_amount` >= 0
                                                       AND `discount_amount` >= 0 AND `total_amount` >= 0 AND `refunded_amount` >= 0),
  ADD CONSTRAINT `orders_refund_within_total`   CHECK (`refunded_amount` <= `total_amount`),
  ADD CONSTRAINT `orders_paid_requirements`     CHECK (`payment_status` NOT IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
                                                       OR (`paid_at` IS NOT NULL AND `customer_email` IS NOT NULL)),
  ADD CONSTRAINT `orders_fulfillment_requires_payment` CHECK (`fulfillment_status` NOT IN ('PARTIALLY_FULFILLED', 'FULFILLED')
                                                       OR `payment_status` IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  ADD CONSTRAINT `orders_review_reason_present` CHECK (`requires_review` = 0 OR `review_reason` IS NOT NULL);

-- order_items: snapshot arithmetic must be consistent.
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_quantity_range`        CHECK (`quantity` BETWEEN 1 AND 100),
  ADD CONSTRAINT `order_items_unit_non_negative`     CHECK (`unit_amount` >= 0),
  ADD CONSTRAINT `order_items_line_amount_consistent` CHECK (`line_amount` = `unit_amount` * `quantity`),
  ADD CONSTRAINT `order_items_currency_format`       CHECK (CAST(`currency` AS BINARY) = CAST(LOWER(`currency`) AS BINARY) AND `currency` REGEXP '^[a-z]{3}$');

-- stripe_events
ALTER TABLE `stripe_events`
  ADD CONSTRAINT `stripe_events_attempts_positive` CHECK (`attempts` >= 1),
  ADD CONSTRAINT `stripe_events_processed_at_set`  CHECK (`status` NOT IN ('PROCESSED', 'IGNORED') OR `processed_at` IS NOT NULL);

-- inventory_movements: shape of each movement type.
ALTER TABLE `inventory_movements`
  ADD CONSTRAINT `inventory_movements_delta_non_zero`      CHECK (`quantity_delta` <> 0),
  ADD CONSTRAINT `inventory_movements_after_non_negative`  CHECK (`quantity_on_hand_after` >= 0),
  ADD CONSTRAINT `inventory_movements_sale_shape`          CHECK (`type` <> 'SALE'
                                                                  OR (`quantity_delta` < 0 AND `order_id` IS NOT NULL AND `sale_key` IS NOT NULL)),
  ADD CONSTRAINT `inventory_movements_sale_key_only_sales` CHECK (`type` = 'SALE' OR `sale_key` IS NULL),
  ADD CONSTRAINT `inventory_movements_restock_positive`    CHECK (`type` NOT IN ('INITIAL_STOCK', 'REFUND_RESTOCK', 'CANCELLATION_RESTOCK', 'RETURN_RESTOCK')
                                                                  OR `quantity_delta` > 0),
  ADD CONSTRAINT `inventory_movements_restock_has_order`   CHECK (`type` NOT IN ('REFUND_RESTOCK', 'CANCELLATION_RESTOCK', 'RETURN_RESTOCK')
                                                                  OR `order_id` IS NOT NULL),
  ADD CONSTRAINT `inventory_movements_manual_has_reason`   CHECK (`type` <> 'MANUAL_ADJUSTMENT' OR `reason` IS NOT NULL);

-- shipments
ALTER TABLE `shipments`
  ADD CONSTRAINT `shipments_tracking_url_https`     CHECK (`tracking_url` IS NULL OR `tracking_url` LIKE 'https://%'),
  ADD CONSTRAINT `shipments_delivered_after_shipped` CHECK (`delivered_at` IS NULL OR `shipped_at` IS NULL OR `delivered_at` >= `shipped_at`);
