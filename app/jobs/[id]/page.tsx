import JobHub from '@/components/JobHub'

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <JobHub jobId={id} />
}
