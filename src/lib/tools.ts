import type Anthropic from '@anthropic-ai/sdk';
import { products } from './products';

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
  escalate_to_human: escalateToHuman,
} as const;

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  listProducts.definition,
  lookupProduct.definition,
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
