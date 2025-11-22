import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status || !['available', 'busy', 'offline'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const counselor = await prisma.user.update({
      where: { id, role: 'counselor' },
      data: { status },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        specialties: true,
        license: true,
        bio: true
      }
    })

    // Map for frontend
    const mappedCounselor = {
      ...counselor,
      isAvailable: counselor.status === 'available',
      specialties: counselor.specialties ? JSON.parse(counselor.specialties) : []
    }

    return NextResponse.json(mappedCounselor)
  } catch (error: unknown) {
    console.error('Counselor update error:', error)
    // Narrow unknown to check prisma error code P2025 (record not found)
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const errObj = error as { code?: unknown }
      if (typeof errObj.code === 'string' && errObj.code === 'P2025') {
        return NextResponse.json({ error: 'Counselor not found' }, { status: 404 })
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}