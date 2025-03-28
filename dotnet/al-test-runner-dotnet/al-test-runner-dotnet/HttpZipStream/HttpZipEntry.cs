namespace NaviPartner.ALTestRunner.HttpZipStream
{
    public class HttpZipEntry
    {

        internal HttpZipEntry(int index)
        {
            Index = index;
        }

        public int Index { get; }

        internal int Signature { get; set; }
        internal short VersionMadeBy { get; set; }
        internal short MinimumVersionNeededToExtract { get; set; }
        internal short GeneralPurposeBitFlag { get; set; }

        public short CompressionMethod { get; internal set; }
        public int FileLastModification { get; internal set; }
        public int CRC32 { get; internal set; }
        public int CompressedSize { get; internal set; }
        public int UncompressedSize { get; internal set; }

        internal short FileNameLength { get; set; }
        internal short ExtraFieldLength { get; set; }
        internal short FileCommentLength { get; set; }

        internal short DiskNumberWhereFileStarts { get; set; }
        internal short InternalFileAttributes { get; set; }
        internal int ExternalFileAttributes { get; set; }

        internal int FileOffset { get; set; }
        public string FileName { get; internal set; }
        public string ExtraField { get; internal set; }
        public string FileComment { get; internal set; }
    }
}