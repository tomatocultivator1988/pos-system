export interface Database {
  public: {
    Tables: {
      business_settings: { Row: BusinessSetting; Insert: Omit<BusinessSetting, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<BusinessSetting, 'id' | 'created_at' | 'updated_at'>> }
      users: { Row: User; Insert: Omit<User, 'id' | 'created_at' | 'updated_at' | 'last_login_at'>; Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at' | 'last_login_at'>> }
      sessions: { Row: Session; Insert: Omit<Session, 'id' | 'created_at'>; Update: Partial<Omit<Session, 'id' | 'created_at'>> }
      kds_devices: { Row: KdsDevice; Insert: Omit<KdsDevice, 'id' | 'created_at' | 'updated_at' | 'last_seen_at'>; Update: Partial<Omit<KdsDevice, 'id' | 'created_at' | 'updated_at' | 'last_seen_at'>> }
      kds_device_tokens: { Row: KdsDeviceToken; Insert: Omit<KdsDeviceToken, 'id' | 'created_at' | 'revoked_at'>; Update: Partial<Omit<KdsDeviceToken, 'id' | 'created_at' | 'revoked_at'>> }
      audit_logs: { Row: AuditLog; Insert: Omit<AuditLog, 'id' | 'created_at'>; Update: Partial<Omit<AuditLog, 'id' | 'created_at'>> }
      menu_categories: { Row: MenuCategory; Insert: Omit<MenuCategory, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<MenuCategory, 'id' | 'created_at' | 'updated_at'>> }
      menu_items: { Row: MenuItem; Insert: Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>> }
      menu_item_variants: { Row: MenuItemVariant; Insert: Omit<MenuItemVariant, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<MenuItemVariant, 'id' | 'created_at' | 'updated_at'>> }
      addon_groups: { Row: AddonGroup; Insert: Omit<AddonGroup, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<AddonGroup, 'id' | 'created_at' | 'updated_at'>> }
      addons: { Row: Addon; Insert: Omit<Addon, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Addon, 'id' | 'created_at' | 'updated_at'>> }
      ingredients: { Row: Ingredient; Insert: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>> }
      recipe_lines: { Row: RecipeLine; Insert: Omit<RecipeLine, 'id'>; Update: Partial<Omit<RecipeLine, 'id'>> }
      stock_receipts: { Row: StockReceipt; Insert: Omit<StockReceipt, 'id' | 'created_at' | 'business_date'>; Update: Partial<Omit<StockReceipt, 'id' | 'created_at' | 'business_date'>> }
      stock_receipt_items: { Row: StockReceiptItem; Insert: Omit<StockReceiptItem, 'id'>; Update: Partial<Omit<StockReceiptItem, 'id'>> }
      inventory_adjustments: { Row: InventoryAdjustment; Insert: Omit<InventoryAdjustment, 'id' | 'created_at' | 'business_date'>; Update: Partial<Omit<InventoryAdjustment, 'id' | 'created_at' | 'business_date'>> }
      inventory_movements: { Row: InventoryMovement; Insert: Omit<InventoryMovement, 'id' | 'created_at' | 'business_date'>; Update: Partial<Omit<InventoryMovement, 'id' | 'created_at' | 'business_date'>> }
      customers: { Row: Customer; Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>> }
      loyalty_transactions: { Row: LoyaltyTransaction; Insert: Omit<LoyaltyTransaction, 'id' | 'created_at'>; Update: Partial<Omit<LoyaltyTransaction, 'id' | 'created_at'>> }
      orders: { Row: Order; Insert: Omit<Order, 'id' | 'created_at' | 'business_date' | 'order_sequence_number' | 'loyalty_points_earned' | 'preparing_at' | 'ready_at' | 'completed_at' | 'voided_at'>; Update: Partial<Omit<Order, 'id' | 'created_at' | 'business_date' | 'order_sequence_number'>> }
      order_items: { Row: OrderItem; Insert: Omit<OrderItem, 'id'>; Update: Partial<Omit<OrderItem, 'id'>> }
      order_item_addons: { Row: OrderItemAddon; Insert: Omit<OrderItemAddon, 'id'>; Update: Partial<Omit<OrderItemAddon, 'id'>> }
      payments: { Row: Payment; Insert: Omit<Payment, 'id' | 'paid_at' | 'business_date'>; Update: Partial<Omit<Payment, 'id' | 'paid_at' | 'business_date'>> }
      payment_reversals: { Row: PaymentReversal; Insert: Omit<PaymentReversal, 'id' | 'created_at' | 'business_date'>; Update: Partial<Omit<PaymentReversal, 'id' | 'created_at' | 'business_date'>> }
      order_status_history: { Row: OrderStatusHistory; Insert: Omit<OrderStatusHistory, 'id' | 'created_at'>; Update: Partial<Omit<OrderStatusHistory, 'id' | 'created_at'>> }
      kds_events: { Row: KdsEvent; Insert: Omit<KdsEvent, 'id' | 'created_at' | 'business_date'>; Update: Partial<Omit<KdsEvent, 'id' | 'created_at' | 'business_date'>> }
      expense_categories: { Row: ExpenseCategory; Insert: Omit<ExpenseCategory, 'id' | 'created_at'>; Update: Partial<Omit<ExpenseCategory, 'id' | 'created_at'>> }
      expenses: { Row: Expense; Insert: Omit<Expense, 'id' | 'created_at' | 'business_date'>; Update: Partial<Omit<Expense, 'id' | 'created_at' | 'business_date'>> }
      idempotency_requests: { Row: IdempotencyRequest; Insert: Omit<IdempotencyRequest, 'created_at' | 'completed_at' | 'expires_at'>; Update: Partial<Omit<IdempotencyRequest, 'created_at' | 'completed_at' | 'expires_at'>> }
      order_reversals: { Row: OrderReversal; Insert: Omit<OrderReversal, 'id' | 'created_at'>; Update: Partial<Omit<OrderReversal, 'id' | 'created_at'>> }
    }
  }
}

export interface BusinessSetting {
  id: string; business_name: string; address: string; phone: string
  currency_code: string; timezone: string; tax_rate: number
  service_charge_rate: number; business_day_cutoff_time: string
  default_low_stock_behavior: string; created_at: string; updated_at: string
}

export interface User {
  id: string; name: string; username: string; email?: string
  password_hash: string; role: 'admin' | 'cashier' | 'kds'
  is_active: boolean; last_login_at?: string; created_at: string; updated_at: string
}

export interface Session {
  id: string; user_id: string; token_hash: string
  expires_at: string; revoked_at?: string; created_at: string
}

export interface KdsDevice {
  id: string; device_name: string; kds_user_id: string
  is_active: boolean; last_seen_at?: string; created_at: string; updated_at: string
}

export interface KdsDeviceToken {
  id: string; kds_device_id: string; token_hash: string
  label?: string; expires_at: string; revoked_at?: string; created_at: string
}

export interface AuditLog {
  id: string; actor_user_id?: string; operation_id?: string
  request_id?: string; source: string; action: string
  entity_type: string; entity_id?: string; old_data?: any; new_data?: any
  ip_address?: string; created_at: string
}

export interface MenuCategory {
  id: string; name: string; sort_order: number; is_active: boolean
  created_at: string; updated_at: string
}

export interface MenuItem {
  id: string; category_id: string; name: string; description: string
  base_price: number; loyalty_points_earned: number
  is_active: boolean; send_to_kds: boolean; image_url?: string
  sort_order: number; created_at: string; updated_at: string
}

export interface MenuItemVariant {
  id: string; menu_item_id: string; name: string
  price_mode: 'override' | 'adjustment'
  price_override?: number; price_adjustment?: number
  is_default: boolean; is_active: boolean; sort_order: number
  created_at: string; updated_at: string
}

export interface AddonGroup {
  id: string; menu_item_id: string; name: string
  min_selections: number; max_selections: number
  is_required: boolean; sort_order: number; is_active: boolean
  created_at: string; updated_at: string
}

export interface Addon {
  id: string; addon_group_id: string; name: string
  price_adjustment: number; is_active: boolean; sort_order: number
  created_at: string; updated_at: string
}

export interface Ingredient {
  id: string; name: string; base_unit: string
  quantity_on_hand: number; reorder_level: number
  weighted_average_unit_cost: number; is_active: boolean
  created_at: string; updated_at: string
}

export interface RecipeLine {
  id: string; menu_item_id?: string; menu_item_variant_id?: string
  addon_id?: string; ingredient_id: string; quantity_required: number
}

export interface StockReceipt {
  id: string; received_at: string; received_by_user_id: string
  reference_number?: string; notes?: string; business_date: string; created_at: string
}

export interface StockReceiptItem {
  id: string; stock_receipt_id: string; ingredient_id: string
  quantity_received: number; unit_cost: number; line_total: number
}

export interface InventoryAdjustment {
  id: string; ingredient_id: string; adjustment_type: string
  quantity_delta: number; reason: string; recorded_by_user_id: string
  approved_by_user_id?: string; business_date: string; created_at: string
}

export interface InventoryMovement {
  id: string; ingredient_id: string; movement_type: string
  quantity_in: number; quantity_out: number
  unit_cost_at_movement: number; total_cost: number
  quantity_balance_after: number; average_unit_cost_after: number
  order_item_id?: string; reference_type?: string; reference_id?: string
  notes?: string; actor_user_id?: string; business_date: string; created_at: string
}

export interface Customer {
  id: string; member_number: string; name: string
  mobile_number?: string; email?: string; loyalty_points_balance: number
  is_active: boolean; created_at: string; updated_at: string
}

export interface LoyaltyTransaction {
  id: string; customer_id: string; order_id?: string
  transaction_type: string; points_delta: number; balance_after: number
  reason?: string; actor_user_id: string; created_at: string
}

export interface Order {
  id: string; order_number: string; order_sequence_number: number
  cashier_user_id: string; customer_id?: string
  status: string; payment_status: string; payment_method: string
  subtotal: number; discount_total: number; tax_total: number; grand_total: number
  loyalty_points_earned: number; notes?: string
  business_date: string; created_at: string
  preparing_at?: string; ready_at?: string; completed_at?: string; voided_at?: string
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string; order_id: string; menu_item_id: string
  menu_item_variant_id?: string; item_name: string; variant_name?: string
  unit_price: number; loyalty_points_per_unit: number
  quantity: number; line_total: number; notes?: string
}

export interface OrderItemAddon {
  id: string; order_item_id: string; addon_id: string
  addon_name: string; unit_price: number; quantity: number; line_total: number
}

export interface Payment {
  id: string; order_id: string; method: string; amount: number
  gcash_reference?: string; status: string; received_by_user_id: string
  paid_at: string; business_date: string; voided_at?: string; refunded_at?: string
}

export interface PaymentReversal {
  id: string; payment_id: string; order_reversal_id: string
  reversal_type: string; amount: number; business_date: string
  processed_by_user_id: string; created_at: string
}

export interface OrderStatusHistory {
  id: string; order_id: string; from_status: string; to_status: string
  changed_by_user_id: string; created_at: string
}

export interface KdsEvent {
  id: string; order_id: string; event_type: string
  event_version: number; business_date: string; created_at: string
}

export interface ExpenseCategory {
  id: string; name: string; is_active: boolean; sort_order: number; created_at: string
}

export interface Expense {
  id: string; expense_category_id: string; expense_date: string
  description: string; amount: number; payment_method?: string
  recorded_by_user_id: string; reference_number?: string
  notes?: string; business_date: string; created_at: string
}

export interface IdempotencyRequest {
  id: string; operation_type: string; actor_user_id: string
  order_id?: string; request_hash?: string; status: string
  created_at: string; completed_at?: string; expires_at: string
}

export interface OrderReversal {
  id: string; order_id: string; operation_id?: string
  reversal_type: string; reason: string; inventory_restoration_basis: string
  ingredient_stock_restored: boolean; authorized_by_user_id: string; created_at: string
}

export interface CartItem {
  menu_item_id: string
  menu_item_variant_id?: string
  name: string
  variant_name?: string
  unit_price: number
  quantity: number
  addons: { addon_id: string; name: string; unit_price: number; quantity: number }[]
  notes?: string
}

export type UserRole = 'admin' | 'cashier' | 'kds'

export interface Shift {
  id: string
  staffId: string
  staffName: string
  startTime: Date
  endTime?: Date
  openingCash: number
  closingCash?: number
  totalSales: number
  status: 'open' | 'closed'
  createdAt: Date
}

export interface Staff {
  id: string
  name: string
  username: string
  role: string
}

export interface AuthContextType {
  currentStaff: Staff | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
