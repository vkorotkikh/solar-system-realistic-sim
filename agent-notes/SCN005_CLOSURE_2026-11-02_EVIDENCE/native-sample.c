#define _GNU_SOURCE
#include <linux/perf_event.h>
#include <sys/syscall.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>
#include <errno.h>

static double seconds(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec/1e9; }
static void copy_ring(void *out, unsigned char *ring, uint64_t pos, size_t n, size_t cap) {
  size_t first = cap-(pos%cap); if (first>n) first=n;
  memcpy(out, ring+(pos%cap), first); if(first<n) memcpy((char*)out+first,ring,n-first);
}
int main(int argc, char **argv) {
  if(argc!=4) { fprintf(stderr,"usage: native-sample PID seconds output.jsonl\n"); return 2; }
  struct perf_event_attr pe={0}; pe.type=PERF_TYPE_SOFTWARE; pe.size=sizeof(pe); pe.config=PERF_COUNT_SW_CPU_CLOCK;
  pe.sample_period=2000000; pe.sample_type=PERF_SAMPLE_IP|PERF_SAMPLE_TID|PERF_SAMPLE_TIME|PERF_SAMPLE_CALLCHAIN;
  pe.disabled=1; pe.exclude_kernel=1; pe.exclude_hv=1; pe.wakeup_events=1;
  int fd=syscall(__NR_perf_event_open,&pe,atoi(argv[1]),-1,-1,0);
  if(fd<0) { perror("perf_event_open"); return 1; }
  size_t page=sysconf(_SC_PAGESIZE), cap=page*256;
  struct perf_event_mmap_page *meta=mmap(NULL,page+cap,PROT_READ|PROT_WRITE,MAP_SHARED,fd,0);
  if(meta==MAP_FAILED) {perror("mmap");return 1;}
  unsigned char *ring=(unsigned char*)meta+page; uint64_t tail=0; FILE *out=fopen(argv[3],"w");
  ioctl(fd,PERF_EVENT_IOC_RESET,0); ioctl(fd,PERF_EVENT_IOC_ENABLE,0);
  double end=seconds()+atof(argv[2]); unsigned samples=0;
  while(seconds()<end) {
    uint64_t head=__atomic_load_n(&meta->data_head,__ATOMIC_ACQUIRE);
    while(tail<head) {
      struct perf_event_header header; copy_ring(&header,ring,tail,sizeof(header),cap);
      if(header.size<sizeof(header)) {fprintf(stderr,"invalid record size\n");return 1;}
      unsigned char buf[65536]; copy_ring(buf,ring,tail,header.size,cap);
      if(header.type==PERF_RECORD_SAMPLE) {
        uint64_t ip,ts,n; uint32_t pid,tid; size_t offset=sizeof(header);
        memcpy(&ip,buf+offset,8);offset+=8; memcpy(&pid,buf+offset,4);offset+=4;memcpy(&tid,buf+offset,4);offset+=4;
        memcpy(&ts,buf+offset,8);offset+=8;memcpy(&n,buf+offset,8);offset+=8;
        fprintf(out,"{\"ip\":\"%llx\",\"pid\":%u,\"tid\":%u,\"time\":%llu,\"callchain\":[",(unsigned long long)ip,pid,tid,(unsigned long long)ts);
        for(uint64_t i=0;i<n && offset+8<=header.size;i++,offset+=8) {uint64_t addr;memcpy(&addr,buf+offset,8);fprintf(out,"%s\"%llx\"",i?",":"",(unsigned long long)addr);}
        fputs("]}\n",out);samples++;
      } else if(header.type==PERF_RECORD_LOST) {fputs("{\"lost\":true}\n",out);}
      tail+=header.size;
    }
    __atomic_store_n(&meta->data_tail,tail,__ATOMIC_RELEASE); usleep(10000);
  }
  ioctl(fd,PERF_EVENT_IOC_DISABLE,0); fclose(out);munmap(meta,page+cap);close(fd);fprintf(stderr,"%u samples\n",samples);return 0;
}
