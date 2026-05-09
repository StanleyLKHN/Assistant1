import type Anthropic from '@anthropic-ai/sdk';
import { products } from './products';
import { getSupabase } from './supabase';

type ToolResult = { result: string; summary: string };

type ToolHandler<I> = (input: I) => Promise<ToolResult>;

type ToolEntry<I> = {
  definition: Anthropic.Tool;
  handler: ToolHandler<I>;
};

const listProducts: ToolEntry<Record<string, never>> = {
  definition: {
    name: 'list_products',
    description:
      "List all products currently available. Returns name, category, price, and short description for each. Call this when the customer asks what's available, what we sell, or what's new.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    const available = products.filter((p) => p.in_stock);
    if (available.length === 0) {
      return { result: 'No products are currently in stock.', summary: '0 products' };
    }
    const result = available
      .map(
        (p) =>
          `- ${p.name} (${p.category}, $${p.price}) [slug: ${p.slug}]\n  ${p.description}`,
      )
      .join('\n');
    return { result, summary: `${available.length} products` };
  },
};

const lookupProduct: ToolEntry<{ slug: string }> = {
  definition: {
    name: 'lookup_product',
    description:
      'Get full details for a single product by its slug. Use when the customer asks about a specific item by name.',
    input_schema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: "The product's url-friendly id, e.g. 'oatmeal-coat'.",
        },
      },
      required: ['slug'],
    },
  },
  handler: async ({ slug }) => {
    const product = products.find((p) => p.slug === slug);
    if (!product) {
      return {
        result: `No product found with slug "${slug}".`,
        summary: 'not found',
      };
    }
    const result = [
      product.name,
      `Category: ${product.category}`,
      `Price: $${product.price}`,
      `In stock: ${product.in_stock ? 'yes' : 'no'}`,
      '',
      product.description,
    ].join('\n');
    return { result, summary: product.name };
  },
};

const checkOrderStatus: ToolEntry<{ order_id: string; email: string }> = {
  definition: {
    name: 'check_order_status',
    description:
      "Look up an order's status. BOTH order_id and email are required — never look up by email alone (privacy: prevents customer A from peeking at customer B's orders).",
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: "The customer's order id, e.g. 'UNW-1003'.",
        },
        email: {
          type: 'string',
          description: 'The email address attached to the order.',
        },
      },
      required: ['order_id', 'email'],
    },
  },
  handler: async ({ order_id, email }) => {
    let supabase;
    try {
      supabase = getSupabase();
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      return { result: `Order lookup unavailable: ${m}`, summary: 'lookup error' };
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .eq('customer_email', email)
      .maybeSingle();

    if (error) {
      return { result: `Order lookup error: ${error.message}`, summary: 'lookup error' };
    }
    if (!data) {
      return {
        result: `No order matches order_id ${order_id} for that email. Do not invent details — offer to escalate to a human teammate.`,
        summary: 'not found',
      };
    }

    const row = data as Record<string, unknown>;
    const status = (row.status as string | null) ?? 'unknown';
    const total = row.total != null ? `$${row.total}` : 'n/a';
    const placedAt = (row.placed_at as string | null) ?? 'unknown';

    const result = [
      `Order ${order_id}`,
      `Status: ${status}`,
      `Total: ${total}`,
      `Placed: ${placedAt}`,
    ].join('\n');

    return { result, summary: status };
  },
};

const escalateToHuman: ToolEntry<{ reason: string }> = {
  definition: {
    name: 'escalate_to_human',
    description:
      'Mark this conversation as needing a human teammate. Use only for refunds, complaints, damaged items, or distress. After calling, write a short final reply.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Short explanation of why the conversation is being escalated.',
        },
      },
      required: ['reason'],
    },
  },
  handler: async ({ reason }) => {
    console.log('[ESCALATED] ' + reason);
    return {
      result: 'logged: a teammate will follow up',
      summary: 'escalated',
    };
  },
};

const registry = {
  list_products: listProducts,
  lookup_product: lookupProduct,
  check_order_status: checkOrderStatus,
  escalate_to_human: escalateToHuman,
} as const;

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  listProducts.definition,
  lookupProduct.definition,
  checkOrderStatus.definition,
  escalateToHuman.definition,
];

export async function runTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const entry = registry[name as keyof typeof registry];
  if (!entry) {
    return {
      result: `Unknown tool: ${name}`,
      summary: 'unknown tool',
    };
  }
  return (entry.handler as ToolHandler<Record<string, unknown>>)(input);
}
