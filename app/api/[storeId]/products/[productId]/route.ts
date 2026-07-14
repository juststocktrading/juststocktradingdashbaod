/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import prismadb from "@/lib/prismadb";

// Define the type for params explicitly
type GetParams = {
  params: Promise<{ productId: string }>;
};

type ModifyParams = {
  params: Promise<{ productId: string; storeId: string }>;
};

export async function GET(req: Request, { params }: GetParams) {
  try {
    // Await the params to get productId
    const { productId } = await params;

    if (!productId) {
      return new NextResponse("Product id is required", { status: 400 });
    }

    const product = await prismadb.product.findUnique({
      where: { id: productId },
      include: {
        images: true,
        category: true,
        variations: { include: { size: true, color: true, images: true } },
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("[PRODUCT_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: ModifyParams) {
  try {
    // Await the params to get productId and storeId
    const { productId, storeId } = await params;
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 403 });
    }

    if (!productId) {
      return new NextResponse("Product id is required", { status: 400 });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 405 });
    }

    // Start a transaction to delete variations and product
    const product = await prismadb.$transaction(async (tx) => {
      // Delete all order items referencing the product
      await tx.orderItem.deleteMany({
        where: { productId },
      });

      // Delete all variations associated with the product
      await tx.variation.deleteMany({
        where: { productId },
      });

      // Delete all images associated with the product
      await tx.image.deleteMany({
        where: { productId },
      });

      // Delete the product
      return tx.product.delete({
        where: { id: productId },
      });
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("[PRODUCT_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: ModifyParams) {
  try {
    const { productId, storeId } = await params;
    const { userId } = await auth();
    const body = await req.json();

    const {
      name,
      description,
      categoryId,
      variations,
      isFeatured,
      isArchived,
      images,
    } = body as {
      name: string;
      description?: string;
      categoryId: string;
      variations: {
        sizeId?: string;
        colorId?: string;
        price: number;
        stock?: number;
        images?: { url: string }[];
      }[];
      isFeatured?: boolean;
      isArchived?: boolean;
      images?: { url: string }[];
    };

    const now = new Date();

    // Validation
    if (!userId) return new NextResponse("Unauthenticated", { status: 403 });
    if (!productId) return new NextResponse("Product id is required", { status: 400 });
    if (!name) return new NextResponse("Name is required", { status: 400 });
    if (!categoryId) return new NextResponse("Category id is required", { status: 400 });
    if (!variations || !variations.length) {
      return new NextResponse("At least one variation is required", { status: 400 });
    }

    // Check store ownership
    const storeByUserId = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });
    if (!storeByUserId) return new NextResponse("Unauthorized", { status: 405 });

    // First update: clear existing variations and images
    await prismadb.product.update({
      where: { id: productId },
      data: {
        name,
        description,
        categoryId,
        isFeatured,
        isArchived,
        updatedAt: now,
        variations: { deleteMany: {} },
        images: { deleteMany: {} },
      },
    });

    // Second update: create new variations and images
    const product = await prismadb.product.update({
      where: { id: productId },
      data: {
        images: {
          create: images?.map((image) => ({
            url: image.url,
            createdAt: now,
            updatedAt: now,
          })) || [],
        },
        variations: {
          create: variations.map((variation) => ({
            sizeId: variation.sizeId ?? null,
            colorId: variation.colorId ?? null,
            price: variation.price,
            stock: variation.stock ?? null,
            createdAt: now,
            updatedAt: now,
            images: {
              create: variation.images?.map((image) => ({
                url: image.url,
                createdAt: now,
                updatedAt: now,
              })) || [],
            },
          })) as any,
        },
      },
      include: {
        variations: {
          include: {
            images: true,
            size: true,
            color: true,
          },
        },
        images: true,
        category: true,
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("[PRODUCT_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
